// src/core/schema.js
// JSON schema validation for Gemini eligibility output.
// Validates each post object against the expected schema.

const VALID_EMPLOYMENT_TYPES = ['permanent', 'contract', 'project', 'apprentice', 'other'];
const VALID_STATUSES = ['Eligible', 'Not Eligible', 'Manual Review'];
const VALID_FLAGS = [
  'online_degree_recognition',
  'experience_required',
  'domicile',
  'obc_certificate',
  'mca_pursuing',
  'equivalence_unclear',
];
const VALID_TIERS = [1, 2, 3, 4];

/**
 * Validate a single post object against the schema.
 * Returns { valid: boolean, errors: string[], cleaned: object }
 */
function validatePost(post, index) {
  const errors = [];
  const cleaned = { ...post };

  // Required string fields
  for (const field of ['organisation', 'post_name']) {
    if (typeof post[field] !== 'string' || post[field].trim() === '') {
      errors.push(`Post ${index}: "${field}" is required and must be a non-empty string.`);
    }
  }

  // Optional string-or-null fields
  for (const field of [
    'advertisement_no', 'post_code', 'qualification_clause', 'pay',
    'location', 'fee', 'official_notification_url', 'official_apply_url', 'reasoning',
  ]) {
    if (post[field] !== null && post[field] !== undefined && typeof post[field] !== 'string') {
      cleaned[field] = String(post[field]);
    }
  }

  // employment_type
  if (!VALID_EMPLOYMENT_TYPES.includes(post.employment_type)) {
    errors.push(
      `Post ${index}: "employment_type" must be one of: ${VALID_EMPLOYMENT_TYPES.join(', ')}. Got: "${post.employment_type}".`
    );
  }

  // tier
  if (!VALID_TIERS.includes(post.tier)) {
    errors.push(`Post ${index}: "tier" must be 1-4. Got: "${post.tier}".`);
    // Try to coerce
    const tierNum = parseInt(post.tier, 10);
    if (VALID_TIERS.includes(tierNum)) {
      cleaned.tier = tierNum;
      errors.pop(); // Remove the error since we fixed it
    }
  }

  // status
  if (!VALID_STATUSES.includes(post.status)) {
    errors.push(
      `Post ${index}: "status" must be one of: ${VALID_STATUSES.join(', ')}. Got: "${post.status}".`
    );
  }

  // Tier 4 is by definition "Unrelated or clearly not eligible".
  // Force status to "Not Eligible" if Tier is 4 to prevent unrelated posts from polluting Manual Review.
  if (cleaned.tier === 4 && cleaned.status !== 'Not Eligible') {
    cleaned.status = 'Not Eligible';
  }

  // flags array
  if (!Array.isArray(post.flags)) {
    errors.push(`Post ${index}: "flags" must be an array.`);
    cleaned.flags = [];
  } else {
    const badFlags = post.flags.filter(f => !VALID_FLAGS.includes(f));
    if (badFlags.length > 0) {
      // Don't error — just warn. Gemini might add useful extra flags.
      // Keep them, but note it.
    }
  }

  // vacancies_count — number or null
  if (post.vacancies_count !== null && post.vacancies_count !== undefined) {
    const num = parseInt(post.vacancies_count, 10);
    if (!isNaN(num)) {
      cleaned.vacancies_count = num;
    } else {
      cleaned.vacancies_count = null;
    }
  }

  // Date fields (DD-MM-YYYY or special values)
  for (const field of ['age_cutoff_date', 'last_date']) {
    const val = post[field];
    if (val && val !== 'not stated' && val !== null) {
      const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
      if (!dateRegex.test(val)) {
        errors.push(`Post ${index}: "${field}" should be DD-MM-YYYY or "not stated". Got: "${val}".`);
      }
    }
  }

  // page_number
  if (post.page_number !== undefined && post.page_number !== 'not paginated') {
    const pn = parseInt(post.page_number, 10);
    if (!isNaN(pn)) cleaned.page_number = pn;
  }

  return { valid: errors.length === 0, errors, cleaned };
}

/**
 * Parse and validate the full Gemini response.
 * @param {string} rawText - Raw text from Gemini
 * @returns {{ posts: object[], errors: string[], parseError: string|null }}
 */
export function parseAndValidate(rawText) {
  let parsed;

  // Strip markdown code fences if present
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Try parsing as JSON (with auto-salvage for truncated responses)
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Attempt salvage if JSON array was truncated
    if (cleaned.startsWith('[')) {
      const lastCloseBrace = cleaned.lastIndexOf('}');
      if (lastCloseBrace !== -1) {
        try {
          const salvaged = cleaned.slice(0, lastCloseBrace + 1) + ']';
          parsed = JSON.parse(salvaged);
          console.warn(`⚠️ Warning: Gemini response was truncated. Salvaged ${parsed.length} complete post(s).`);
        } catch {}
      }
    }

    if (!parsed) {
      return {
        posts: [],
        errors: [],
        parseError: `Failed to parse Gemini response as JSON: ${e.message}\n\nRaw response (first 500 chars):\n${rawText.slice(0, 500)}`,
      };
    }
  }

  // Ensure it's an array
  if (!Array.isArray(parsed)) {
    // If it's a single object, wrap it
    if (parsed && typeof parsed === 'object') {
      parsed = [parsed];
    } else {
      return {
        posts: [],
        errors: [],
        parseError: `Expected a JSON array, got: ${typeof parsed}`,
      };
    }
  }

  // Validate each post
  const allErrors = [];
  const validatedPosts = [];
  for (let i = 0; i < parsed.length; i++) {
    const { valid, errors, cleaned: cleanedPost } = validatePost(parsed[i], i + 1);
    allErrors.push(...errors);
    validatedPosts.push(cleanedPost);
  }

  return {
    posts: validatedPosts,
    errors: allErrors,
    parseError: null,
  };
}
