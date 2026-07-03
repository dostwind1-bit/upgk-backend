const axios = require('axios');
const natural = require('natural');
const TfIdf = natural.TfIdf;

/**
 * ============================================================
 * TEXT MODERATION - Google Perspective API (100% FREE)
 * Detects: toxicity, insults, threats, profanity, hate speech
 * Get free key: https://www.perspectiveapi.com/
 * ============================================================
 */
async function checkTextModeration(text) {
  const result = { flags: [], score: 0, isSafe: true };

  if (!text || text.trim().length === 0) return result;

  try {
    const response = await axios.post(
      `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${process.env.PERSPECTIVE_API_KEY}`,
      {
        comment: { text: text.substring(0, 3000) }, // Perspective has char limits
        languages: ['en', 'hi'],
        requestedAttributes: {
          TOXICITY: {},
          SEVERE_TOXICITY: {},
          INSULT: {},
          THREAT: {},
          PROFANITY: {},
        },
      }
    );

    const scores = response.data.attributeScores;
    let maxScore = 0;

    for (const attr in scores) {
      const value = scores[attr].summaryScore.value;
      if (value > maxScore) maxScore = value;
      if (value >= 0.75) {
        result.flags.push(attr.toLowerCase());
      }
    }

    result.score = maxScore;
    result.isSafe = maxScore < 0.75; // threshold - tune as needed
  } catch (error) {
    console.error('Perspective API error:', error.response?.data || error.message);
    // Fail-open with a note so content goes to manual review instead of blocking everything
    result.flags.push('moderation_check_failed');
    result.isSafe = true; // don't block user if API itself fails
  }

  return result;
}

/**
 * ============================================================
 * PLAGIARISM / COPIED CONTENT CHECK - Self-built, FREE
 * Compares new post text against existing approved posts
 * using TF-IDF + cosine similarity. No external API needed.
 * ============================================================
 */
async function checkPlagiarism(newText, existingTexts = []) {
  const result = { isDuplicate: false, similarityScore: 0, matchedIndex: -1 };

  if (!newText || existingTexts.length === 0) return result;

  const tfidf = new TfIdf();
  tfidf.addDocument(newText);
  existingTexts.forEach((t) => tfidf.addDocument(t));

  // Build term vectors and compute cosine similarity manually
  const terms = new Set();
  tfidf.listTerms(0).forEach((t) => terms.add(t.term));

  function vectorFor(docIndex) {
    const vec = {};
    tfidf.listTerms(docIndex).forEach((t) => {
      vec[t.term] = t.tfidf;
    });
    return vec;
  }

  function cosineSim(vecA, vecB) {
    const allTerms = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
    let dot = 0, magA = 0, magB = 0;
    allTerms.forEach((term) => {
      const a = vecA[term] || 0;
      const b = vecB[term] || 0;
      dot += a * b;
      magA += a * a;
      magB += b * b;
    });
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  const newVec = vectorFor(0);
  let maxSim = 0;
  let matchedIndex = -1;

  for (let i = 1; i <= existingTexts.length; i++) {
    const sim = cosineSim(newVec, vectorFor(i));
    if (sim > maxSim) {
      maxSim = sim;
      matchedIndex = i - 1;
    }
  }

  result.similarityScore = maxSim;
  result.isDuplicate = maxSim >= 0.85; // 85%+ similarity = likely copied
  result.matchedIndex = matchedIndex;

  return result;
}

/**
 * ============================================================
 * IMAGE MODERATION - Sightengine (FREE - 500 checks/month)
 * Detects: nudity, gore, weapons, offensive symbols, drugs
 * Get free account: https://sightengine.com/
 * ============================================================
 */
async function checkImageModeration(imageUrl) {
  const result = { flags: [], score: 0, isSafe: true };

  try {
    const response = await axios.get('https://api.sightengine.com/1.0/check.json', {
      params: {
        url: imageUrl,
        models: 'nudity-2.1,weapon,gore-2.0,offensive-2.0,recreational_drug',
        api_user: process.env.SIGHTENGINE_API_USER,
        api_secret: process.env.SIGHTENGINE_API_SECRET,
      },
    });

    const data = response.data;
    let maxScore = 0;

    if (data.nudity) {
      const nudityScore = Math.max(data.nudity.sexual_activity || 0, data.nudity.sexual_display || 0, data.nudity.erotica || 0);
      if (nudityScore > 0.5) { result.flags.push('nudity'); maxScore = Math.max(maxScore, nudityScore); }
    }
    if (data.weapon && data.weapon.classes) {
      const weaponScore = Math.max(...Object.values(data.weapon.classes));
      if (weaponScore > 0.5) { result.flags.push('weapon'); maxScore = Math.max(maxScore, weaponScore); }
    }
    if (data.gore && data.gore.prob > 0.5) { result.flags.push('gore'); maxScore = Math.max(maxScore, data.gore.prob); }
    if (data.offensive && data.offensive.prob > 0.5) { result.flags.push('offensive_symbols'); maxScore = Math.max(maxScore, data.offensive.prob); }
    if (data.drug && data.drug.prob > 0.5) { result.flags.push('drugs'); maxScore = Math.max(maxScore, data.drug.prob); }

    result.score = maxScore;
    result.isSafe = result.flags.length === 0;
  } catch (error) {
    console.error('Sightengine API error:', error.response?.data || error.message);
    result.flags.push('moderation_check_failed');
    result.isSafe = true; // fail-open, let admin manually review
  }

  return result;
}

/**
 * ============================================================
 * MASTER FUNCTION - runs all applicable checks on a post
 * Returns final moderationStatus + flags to save on Post model
 * ============================================================
 */
async function moderatePost({ postType, title, content, images = [], videoThumbnail = '', existingTexts = [] }) {
  const allFlags = [];
  let maxScore = 0;
  let needsManualReview = false;

  // Text check (title + content combined)
  const textToCheck = `${title} ${content}`.trim();
  if (textToCheck) {
    const textResult = await checkTextModeration(textToCheck);
    allFlags.push(...textResult.flags);
    maxScore = Math.max(maxScore, textResult.score);
    if (textResult.flags.includes('moderation_check_failed')) needsManualReview = true;
  }

  // Plagiarism check (only for blog/question text posts)
  if (content && (postType === 'blog' || postType === 'question')) {
    const plagResult = await checkPlagiarism(content, existingTexts);
    if (plagResult.isDuplicate) {
      allFlags.push('plagiarism');
      maxScore = Math.max(maxScore, plagResult.similarityScore);
    }
  }

  // Image checks
  for (const imgUrl of images) {
    const imgResult = await checkImageModeration(imgUrl);
    allFlags.push(...imgResult.flags);
    maxScore = Math.max(maxScore, imgResult.score);
    if (imgResult.flags.includes('moderation_check_failed')) needsManualReview = true;
  }

  // Video thumbnail check
  if (videoThumbnail) {
    const thumbResult = await checkImageModeration(videoThumbnail);
    allFlags.push(...thumbResult.flags);
    maxScore = Math.max(maxScore, thumbResult.score);
  }

  const uniqueFlags = [...new Set(allFlags)].filter((f) => f !== 'moderation_check_failed');

  let moderationStatus;
  if (needsManualReview) {
    moderationStatus = 'flagged_for_review';
  } else if (uniqueFlags.length > 0) {
    moderationStatus = 'rejected';
  } else {
    moderationStatus = 'approved';
  }

  return {
    moderationStatus,
    moderationFlags: uniqueFlags,
    moderationScore: maxScore,
    moderationNote: needsManualReview
      ? 'AI check failed - queued for manual admin review'
      : uniqueFlags.length > 0
      ? `Auto-rejected: ${uniqueFlags.join(', ')}`
      : 'Passed all AI checks',
  };
}

module.exports = {
  checkTextModeration,
  checkPlagiarism,
  checkImageModeration,
  moderatePost,
};
