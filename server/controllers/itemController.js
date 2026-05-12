// server/controllers/itemController.js
const supabase = require('../config/supabaseClient');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Resend } = require('resend');

const fetchFn = global.fetch || (() => {
  throw new Error('Fetch is not available in this Node.js runtime. Please use Node 18+ or install a compatible fetch implementation.');
});

const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const RESEND_FROM_EMAIL = 'onboarding@resend.dev';

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is missing in .env');
}

const aiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const configuredGeminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const geminiModelCandidates = Array.from(new Set([
  configuredGeminiModel,
  'gemini-2.5-flash-lite',
])).filter(Boolean);

const isModelNotFoundError = (error) => {
  const message = error?.message || '';
  return /404|not found/i.test(message);
};

const generateWithModelFallback = async (requestPayload) => {
  if (!aiClient || typeof aiClient.getGenerativeModel !== 'function') {
    throw new Error('Gemini client is not initialized correctly.');
  }

  let lastError = null;

  for (const modelName of geminiModelCandidates) {
    try {
      const model = aiClient.getGenerativeModel({ model: modelName });
      if (!model || typeof model.generateContent !== 'function') {
        continue;
      }

      const response = await model.generateContent(requestPayload);
      return { response, modelName };
    } catch (error) {
      lastError = error;
      if (!isModelNotFoundError(error)) {
        throw error;
      }

      console.warn(`[analyzeItem] Gemini model unavailable: ${modelName}. Trying next candidate.`);
    }
  }

  throw lastError || new Error('No compatible Gemini model was found for this API key.');
};

const extractAiText = (response) => {
  if (!response) return '';
  if (response.response && typeof response.response.text === 'function') {
    return response.response.text().trim();
  }
  if (typeof response.text === 'function') {
    return response.text().trim();
  }
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const outputs = response.output || [];
  const firstOutput = Array.isArray(outputs) ? outputs[0] : outputs;
  const contents = firstOutput?.content || [];
  const textPieces = [];

  for (const block of contents) {
    if (block?.type === 'text' && block?.text) {
      textPieces.push(block.text);
    } else if (typeof block === 'string') {
      textPieces.push(block);
    }
  }

  return textPieces.join(' ').trim();
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const extractJsonFromText = (text) => {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
};

const stopWords = new Set([
  'the', 'and', 'or', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'has', 'have', 'had',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'item',
  'thing', 'object', 'looks', 'like', 'very', 'really', 'just', 'only', 'as', 'by', 'from', 'my', 'your'
]);

// Primary object categories (nouns) - higher priority keywords
const primaryObjectKeywords = {
  phone: ['phone', 'mobile', 'smartphone', 'iphone', 'android'],
  wallet: ['wallet', 'purse', 'billfold'],
  keys: ['keys', 'keychain', 'keyring'],
  case: ['case', 'cover', 'holder', 'pouch'],
  backpack: ['backpack', 'bag', 'rucksack', 'pack', 'sack'],
  watch: ['watch', 'smartwatch', 'wristwatch'],
  ring: ['ring', 'band', 'engagement'],
  headphones: ['headphones', 'earbuds', 'earphones', 'headset', 'airpods'],
  glasses: ['glasses', 'spectacles', 'sunglasses', 'shades'],
  hat: ['hat', 'cap', 'beanie', 'bonnet'],
  umbrella: ['umbrella', 'parasol'],
  shoes: ['shoes', 'sneakers', 'boots', 'sandals', 'heels'],
  jacket: ['jacket', 'coat', 'sweater', 'hoodie', 'cardigan'],
  bottle: ['bottle', 'tumbler', 'water bottle', 'thermos'],
  notebook: ['notebook', 'journal', 'pad', 'planner'],
  pen: ['pen', 'pencil', 'marker'],
  laptop: ['laptop', 'macbook', 'computer', 'device'],
  tablet: ['tablet', 'ipad'],
};

// Color and texture keywords - secondary/accent keywords
const colorKeywords = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'gray', 'grey', 'silver', 'gold', 'rose', 'transparent', 'clear', 'dark', 'light', 'bright', 'pale', 'metallic'];
const textureKeywords = ['leather', 'plastic', 'metal', 'fabric', 'canvas', 'denim', 'cotton', 'silk', 'rubber', 'glass', 'ceramic', 'wooden', 'wood'];

const normalizeText = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = (value) => normalizeText(value)
  .split(' ')
  .filter(token => token && !stopWords.has(token));

const buildComparableText = (item) => [item.display_name || '', item.ai_description || ''].join(' ').trim();

// Extract primary object category from text
const extractPrimaryObject = (text) => {
  const normalized = normalizeText(text);
  
  for (const [category, keywords] of Object.entries(primaryObjectKeywords)) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        return category;
      }
    }
  }
  
  return null;
};

// Extract colors mentioned in text
const extractColors = (text) => {
  const normalized = normalizeText(text);
  const foundColors = [];
  
  for (const color of colorKeywords) {
    if (normalized.includes(color)) {
      foundColors.push(color);
    }
  }
  
  return foundColors;
};

// Extract textures mentioned in text
const extractTextures = (text) => {
  const normalized = normalizeText(text);
  const foundTextures = [];
  
  for (const texture of textureKeywords) {
    if (normalized.includes(texture)) {
      foundTextures.push(texture);
    }
  }
  
  return foundTextures;
};

// Improved similarity score with object category priority
const simpleSimilarityScore = (studentDescription, itemText) => {
  const studentNormalized = normalizeText(studentDescription);
  const itemNormalized = normalizeText(itemText);

  if (!studentNormalized || !itemNormalized) return 0;

  // ========== STEP 1: Compare Primary Objects ==========
  const studentObject = extractPrimaryObject(studentDescription);
  const itemObject = extractPrimaryObject(itemText);
  
  let objectMatch = 1.0; // Default: benefit of the doubt
  
  if (studentObject && itemObject) {
    if (studentObject !== itemObject) {
      // Primary objects don't match: penalize by 50%
      objectMatch = 0.5;
    } else {
      // Primary objects match: bonus
      objectMatch = 1.1;
    }
  } else if (studentObject && !itemObject) {
    // Student specified object, but item description doesn't have it
    objectMatch = 0.6;
  } else if (!studentObject && itemObject) {
    // Item has specific object, student didn't specify
    objectMatch = 0.8;
  }

  // ========== STEP 2: Calculate Token-Based Overlap (Keyword Matching) ==========
  const studentTokens = tokenize(studentDescription);
  const itemTokens = tokenize(itemText);
  
  if (!studentTokens.length || !itemTokens.length) return 0;

  const itemTokenSet = new Set(itemTokens);
  const overlap = studentTokens.filter(token => itemTokenSet.has(token)).length;
  
  const coverage = overlap / Math.max(studentTokens.length, 1);
  const reverseCoverage = overlap / Math.max(itemTokens.length, 1);
  
  let tokenScore = (coverage * 0.65) + (reverseCoverage * 0.35);

  // ========== STEP 3: Color/Texture Bonus (Secondary) ==========
  const studentColors = extractColors(studentDescription);
  const itemColors = extractColors(itemText);
  const studentTextures = extractTextures(studentDescription);
  const itemTextures = extractTextures(itemText);
  
  let colorMatch = 0;
  let textureMatch = 0;
  
  if (studentColors.length > 0 && itemColors.length > 0) {
    const colorOverlap = studentColors.filter(c => itemColors.includes(c)).length;
    colorMatch = colorOverlap / Math.max(studentColors.length, itemColors.length);
  }
  
  if (studentTextures.length > 0 && itemTextures.length > 0) {
    const textureOverlap = studentTextures.filter(t => itemTextures.includes(t)).length;
    textureMatch = textureOverlap / Math.max(studentTextures.length, itemTextures.length);
  }

  // ========== STEP 4: Substring Matching ==========
  let substringBonus = 0;
  if (studentNormalized.includes(itemNormalized) || itemNormalized.includes(studentNormalized)) {
    substringBonus = 0.15;
  }

  // ========== FINAL SCORE CALCULATION ==========
  // Object match is critical (50% weight)
  // Token similarity is important (35% weight)
  // Color/texture is supporting (10% weight)
  // Substring bonus is minor (5% weight)
  let finalScore = (objectMatch * 0.5) + (tokenScore * 0.35) + ((colorMatch + textureMatch) / 2 * 0.1) + substringBonus;

  return Math.max(0, Math.min(1, finalScore));
};

// Calculate date proximity between item found date and student's reported lost date
// Returns a human-readable string like "Found 2 hours after reported loss"
// STRICT: Penalizes mismatches significantly
const calculateDateProximity = (itemCreatedAt, studentLostDate) => {
  if (!itemCreatedAt || !studentLostDate) return null;

  const itemTime = new Date(itemCreatedAt).getTime();
  const lostTime = new Date(studentLostDate).getTime();
  const diffMs = itemTime - lostTime;
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    const absDiffHours = Math.abs(diffHours);
    const absDiffDays = Math.abs(diffDays);
    if (absDiffHours < 1) {
      return 'Found before reported loss (within 1 hour)';
    } else if (absDiffHours < 24) {
      return `Found ${absDiffHours} hour(s) before reported loss`;
    } else {
      return `Found ${absDiffDays} day(s) before reported loss`;
    }
  } else {
    if (diffHours < 1) {
      return 'Found within 1 hour of reported loss';
    } else if (diffHours < 24) {
      return `Found ${diffHours} hour(s) after reported loss`;
    } else {
      return `Found ${diffDays} day(s) after reported loss`;
    }
  }
};

// Calculate date proximity confidence penalty
// Penalizes matches where the time difference is too large
// STRICT: Anything beyond 7 days is highly suspicious
const calculateDateProximityPenalty = (itemCreatedAt, studentLostDate) => {
  if (!itemCreatedAt || !studentLostDate) {
    // No dates provided, no penalty
    return 1.0;
  }

  const itemTime = new Date(itemCreatedAt).getTime();
  const lostTime = new Date(studentLostDate).getTime();
  const diffMs = itemTime - lostTime;
  const diffHours = Math.abs(diffMs) / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  // Penalty based on time difference:
  // 0-1 hour: no penalty (1.0)
  // 1-6 hours: minor penalty (0.95)
  // 6-24 hours: moderate penalty (0.85)
  // 24-48 hours: significant penalty (0.70)
  // 48-72 hours: heavy penalty (0.55)
  // 72+ hours: very heavy penalty (0.4)
  // 7+ days: extremely suspicious (0.2)

  if (diffHours <= 1) return 1.0;
  if (diffHours <= 6) return 0.95;
  if (diffHours <= 24) return 0.85;
  if (diffHours <= 48) return 0.70;
  if (diffHours <= 72) return 0.55;
  if (diffDays <= 7) return 0.4;
  return 0.2; // 7+ days is highly unlikely
};

// Filter items by temporal proximity (24 hours before to present)
// Returns items that were found within the acceptable time window
const filterItemsByTemporalProximity = (items, studentLostDate) => {
  if (!studentLostDate) {
    // If no lost date provided, return all items (no temporal filtering)
    return items;
  }

  const lostTime = new Date(studentLostDate).getTime();
  const BUFFER_24_HOURS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  return items.filter(item => {
    if (!item.created_at) return false;

    const itemTime = new Date(item.created_at).getTime();
    const diff = itemTime - lostTime;

    // Accept items found:
    // 1. Up to 24 hours BEFORE the reported lost date (buffer for memory errors)
    // 2. Up to the present (any time after the lost date)
    return diff >= -BUFFER_24_HOURS;
  });
};

const calculateMatchScoresWithGemini = async (studentDescription, items) => {
  const candidates = items.slice(0, 20).map(item => ({
    id: item.id,
    display_name: item.display_name || '',
    ai_description: item.ai_description || '',
    combined_text: buildComparableText(item),
    created_at: item.created_at,
  }));

  const prompt = `You are a lost-and-found matching assistant with strict matching criteria.

CRITICAL RULES:
1. PRIMARY OBJECT MATCHING (Highest Priority): 
   - Identify the main noun/object in the student description (e.g., "Phone", "Wallet", "Case", "Backpack")
   - Identify the main noun/object in each item
   - If the primary objects DO NOT MATCH (e.g., student looking for "Case" but item is "Phone"), the match score MUST be reduced by at least 50%, regardless of color similarity.
   - Example: "Black strap case" (item) vs "Black smartphone" (student) = MUST have low score because Case ≠ Phone.

2. SECONDARY FACTORS (Lower Priority):
   - Color matches should only increase score if primary objects match or are strongly related.
   - Texture/material matches are supporting evidence, not primary evidence.

3. KEYWORD HIERARCHY:
   - Prioritize specific nouns: Phone, Wallet, Keys, Case, Backpack, Watch, Ring, Headphones, Glasses, etc.
   - De-prioritize generic adjectives: black, silver, small, etc.

4. SEMANTIC SIMILARITY:
   - "Smartphone" ≈ "Phone" (related, matches)
   - "Case" ≠ "Phone" (NOT related, low score)
   - "Backpack" ≈ "Bag" (related, matches)

Return ONLY valid JSON with a root object containing a 'matches' array. Each match must have: id (matching the input), match_score (integer 0-100). No additional text or explanation.

student_description:
${studentDescription.trim()}

items:
${JSON.stringify(candidates, null, 2)}`;

  const requestPayload = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }],
    }],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 1000,
      responseMimeType: 'application/json',
    },
  };

  try {
    const { response } = await generateWithModelFallback(requestPayload);
    const responseText = extractAiText(response);
    const parsed = extractJsonFromText(responseText);

    if (parsed && Array.isArray(parsed.matches)) {
      return parsed.matches.map(match => {
        const candidate = candidates.find(item => item.id === match.id);
        const heuristicScore = candidate ? Math.round(simpleSimilarityScore(studentDescription, candidate.combined_text) * 100) : 0;

        return {
          id: match.id,
          match_score: Math.max(Number(match.match_score) || 0, heuristicScore),
          created_at: candidate?.created_at,
        };
      });
    }
  } catch (err) {
    console.warn('[calculateMatchScoresWithGemini] AI similarity fallback:', err.message || err);
  }

  return candidates.map(item => ({
    id: item.id,
    match_score: Math.round(simpleSimilarityScore(studentDescription, item.combined_text) * 100),
    created_at: item.created_at,
  }));
};

const blindSearchMatch = async (req, res) => {
  const { item_description, date_missing } = req.body || {};
  if (!item_description || !item_description.trim()) {
    return res.status(400).json({ error: 'item_description is required' });
  }

  try {
    const { data: items, error } = await supabase
      .from('items')
      .select('id, display_name, ai_description, created_at')
      .eq('status', 'approved')
      .not('ai_description', 'is', null)
      .neq('ai_description', '')
      .order('created_at', { ascending: false });

    if (error) throw error;

    let candidates = (items || []).filter(item => item.ai_description && item.ai_description.trim());
    
    // Apply temporal filtering if lost date is provided
    if (date_missing) {
      candidates = filterItemsByTemporalProximity(candidates, date_missing);
    }

    if (!candidates.length) {
      return res.json({ 
        matched_item_id: null, 
        match_score: 0, 
        message: 'No eligible items available for blind matching.' 
      });
    }

    const matches = await calculateMatchScoresWithGemini(item_description, candidates);
    
    // Apply strict date proximity penalty to all match scores
    const matchesWithDatePenalty = matches.map(match => {
      const dateProximityPenalty = calculateDateProximityPenalty(match.created_at, date_missing);
      const penalizedScore = Math.round(match.match_score * dateProximityPenalty);
      
      return {
        id: match.id,
        match_score: penalizedScore,
        created_at: match.created_at,
        date_penalty_factor: dateProximityPenalty,
      };
    });
    
    // Sort by penalized match score (descending), then by created_at (most recent first)
    const sortedMatches = matchesWithDatePenalty.sort((a, b) => {
      if (b.match_score !== a.match_score) {
        return b.match_score - a.match_score;
      }
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return timeB - timeA;
    });

    const bestMatch = sortedMatches[0] || { id: null, match_score: 0, created_at: null };
    const matchedItem = candidates.find(item => item.id === bestMatch.id);
    const dateProximity = date_missing && bestMatch.created_at 
      ? calculateDateProximity(bestMatch.created_at, date_missing)
      : null;

    res.json({
      matched_item_id: bestMatch.id,
      match_score: bestMatch.match_score,
      matched_item_name: matchedItem?.display_name || null,
      time_captured: bestMatch.created_at,
      date_proximity: dateProximity,
    });
  } catch (err) {
    console.error('[blindSearchMatch] Error', err);
    res.status(500).json({ error: err.message || 'Blind match search failed' });
  }
};

const submitLostReport = async (req, res) => {
  const {
    student_name,
    contact_number,
    student_email,
    item_description,
    date_missing,
    time_missing,
    last_location,
    ref_photo_url_1,
    ref_photo_url_2,
    matched_item_id,
    match_score,
  } = req.body || {};

  if (!student_name || !student_email || !item_description) {
    return res.status(400).json({ error: 'student_name, student_email, and item_description are required' });
  }

  try {
    const reportPayload = {
      student_name,
      contact_number: contact_number || '',
      student_email,
      item_description,
      date_missing: date_missing || '',
      time_missing: time_missing || '',
      last_location: last_location || '',
      ref_photo_url_1: ref_photo_url_1 || '',
      ref_photo_url_2: ref_photo_url_2 || '',
      matched_item_id: matched_item_id || null,
      match_score: Number(match_score) || 0,
      status: 'pending',
    };

    const { data, error } = await supabase.from('lost_reports').insert([reportPayload]).select();
    if (error) throw error;

    res.status(201).json({ message: 'Lost report submitted successfully', report: data[0] });
  } catch (err) {
    console.error('[submitLostReport] Error', err);
    res.status(500).json({ error: err.message || 'Failed to submit lost report' });
  }
};

const getLostReports = async (req, res) => {
  try {
    const { data, error } = await supabase.from('lost_reports').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[getLostReports] Error', err);
    res.status(500).json({ error: err.message || 'Failed to fetch lost reports' });
  }
};

const sendCustomNotification = async (studentEmail, studentName, customMessage) => {
  const recipientEmail = String(studentEmail || '').trim();
  const recipientName = String(studentName || 'Student').trim() || 'Student';
  const messageBody = String(customMessage || '').trim();

  if (!resendClient) {
    throw new Error('RESEND_API_KEY is missing in .env');
  }

  if (!recipientEmail) {
    throw new Error('studentEmail is required');
  }

  if (!messageBody) {
    throw new Error('customMessage is required');
  }

  const safeMessageHtml = escapeHtml(messageBody).replace(/\n/g, '<br>');
  const safeRecipientName = escapeHtml(recipientName);

  const { data, error } = await resendClient.emails.send({
    from: RESEND_FROM_EMAIL,
    to: recipientEmail,
    subject: 'Update from DominiFinds',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2 style="margin: 0 0 12px; color: #0f172a;">Hello ${safeRecipientName},</h2>
        <p style="margin: 0 0 16px;">You have a new update from the DominiFinds admin team.</p>
        <div style="padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
          ${safeMessageHtml}
        </div>
        <p style="margin: 16px 0 0; color: #475569; font-size: 0.95rem;">This message was sent from the DominiFinds Verification Hub.</p>
      </div>
    `,
    text: `Hello ${recipientName},\n\n${messageBody}\n\nThis message was sent from the DominiFinds Verification Hub.`,
  });

  if (error) {
    throw error;
  }

  return data;
};

const sendStudentUpdate = async (req, res) => {
  const { id } = req.params;
  const { studentEmail, studentName, customMessage } = req.body || {};

  try {
    let reportEmail = studentEmail;
    let reportName = studentName;

    if (id) {
      const { data: report, error: reportError } = await supabase
        .from('lost_reports')
        .select('student_email, student_name, status')
        .eq('id', id)
        .single();

      if (reportError) throw reportError;
      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }

      if ((report.status || '').toLowerCase() !== 'pending') {
        return res.status(400).json({ error: 'Only pending reports can receive an update' });
      }

      reportEmail = report.student_email || reportEmail;
      reportName = report.student_name || reportName;
    }

    const emailResult = await sendCustomNotification(reportEmail, reportName, customMessage);

    return res.json({
      message: 'Notification email sent successfully.',
      studentEmail: reportEmail,
      studentName: reportName || 'Student',
      email: emailResult,
    });
  } catch (err) {
    console.error('[sendStudentUpdate] Error', err);
    return res.status(500).json({ error: err.message || 'Failed to send notification email' });
  }
};

const approveMatch = async (req, res) => {
  const { id } = req.params;
  const { matched_item_id, item_id, released_by } = req.body || {};
  const selectedItemId = item_id || matched_item_id || null;
  try {
    const { data, error } = await supabase
      .from('lost_reports')
      .update({
        status: 'resolved',
        matched_item_id: selectedItemId,
        resolved_at: new Date().toISOString(),
        released_by: released_by || 'Admin',
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Report not found or already processed' });
    }

    if (selectedItemId) {
      const { error: itemError } = await supabase
        .from('items')
        .update({ status: 'claimed' })
        .eq('id', selectedItemId);

      if (itemError) throw itemError;
    }

    res.json({ message: 'Match approved successfully', report: data[0] });
  } catch (err) {
    console.error('[approveMatch] Error', err);
    res.status(500).json({ error: err.message || 'Failed to approve match' });
  }
};

const rejectMatch = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('lost_reports')
      .update({ status: 'pending', matched_item_id: null, match_score: 0 })
      .eq('id', id)
      .eq('status', 'pending')
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Report not found or already processed' });
    }

    res.json({ message: 'Match rejected successfully', report: data[0] });
  } catch (err) {
    console.error('[rejectMatch] Error', err);
    res.status(500).json({ error: err.message || 'Failed to reject match' });
  }
};

// Upload an item (base64 from IoT device or client)
const uploadItem = async (req, res) => {
  try {
    const { name, fileBase64, type } = req.body; // IoT sends base64
    const fileType = type || 'image/png';
    const fileExt = fileType.split('/')[1] || 'png';
    const fileName = `${Date.now()}_${name}.${fileExt}`;

    // Upload image to Supabase Storage bucket 'items'
    const { data: storageData, error: storageError } = await supabase.storage
      .from('items')
      .upload(fileName, Buffer.from(fileBase64, 'base64'), {
        contentType: fileType,
        upsert: true,
      });

    if (storageError) throw storageError;

    // Construct public URL for the uploaded file
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/items/${fileName}`;

    // Insert metadata into the database
    const { data: dbData, error: dbError } = await supabase
      .from('items')
      .insert([{ name, image_url: publicUrl, status: 'pending' }])
      .select();

    if (dbError) throw dbError;

    res.json({ message: 'Item uploaded successfully!', item: dbData[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Get all items
const getItems = async (req, res) => {
  try {
    const { data, error } = await supabase.from('items').select('*');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Analyze a pending item image with Gemini AI and update metadata
const analyzeItem = async (req, res) => {
  const id = req.params.id || req.body?.id;
  const inputImageUrl = req.body?.image_url;
  console.log('[analyzeItem] request received', { id, image_url: inputImageUrl });

  if (!id) {
    console.log('[analyzeItem] missing item id');
    return res.status(400).json({ error: 'Item id is required' });
  }

  try {
    const { data: itemData, error: itemError } = await supabase
      .from('items')
      .select('image_url, name')
      .eq('id', id)
      .single();

    if (itemError || !itemData) {
      console.log('[analyzeItem] item lookup failed', { itemError });
      return res.status(404).json({ error: 'Item not found' });
    }

    const imageUrl = inputImageUrl || itemData.image_url;
    console.log('[analyzeItem] using imageUrl', imageUrl);
    if (!imageUrl) {
      console.log('[analyzeItem] missing image URL');
      return res.status(400).json({ error: 'Item image URL is missing' });
    }

    const imageResponse = await fetchFn(imageUrl);
    console.log('[analyzeItem] fetched image status', imageResponse.status);
    if (!imageResponse.ok) {
      throw new Error(`Unable to fetch image from storage: ${imageResponse.status} ${imageResponse.statusText}`);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

    const prompt = 'Analyze this lost item image. Return a JSON object with two fields: "display_name" (concise item name) and "ai_description" (physical description). Do not add any conversational text.';
    console.log('[analyzeItem] sending request to Gemini', { prompt, modelCandidates: geminiModelCandidates });

    const modelRequest = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: imageBuffer.toString('base64'),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.0,
        responseMimeType: 'application/json',
      },
    };

    const { response: aiResponse, modelName: resolvedModel } = await generateWithModelFallback(modelRequest);
    console.log('[analyzeItem] Gemini model used', { model: resolvedModel });

    console.log('[analyzeItem] raw Gemini response', JSON.stringify(aiResponse));
    const responseText = extractAiText(aiResponse);
    console.log('[analyzeItem] extracted AI text', responseText);

    const jsonMatch = responseText.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      console.log('[analyzeItem] no JSON found in responseText');
      throw new Error('AI response did not contain valid JSON');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.log('[analyzeItem] JSON parse failed', parseError);
      throw new Error('AI response contained malformed JSON');
    }

    const displayName = parsed.display_name?.trim() || itemData.name;
    const aiDescription = parsed.ai_description?.trim() || '';
    console.log('[analyzeItem] parsed output', { displayName, aiDescription });

    const { data: updatedItem, error: updateError } = await supabase
      .from('items')
      .update({
        display_name: displayName,
        ai_description: aiDescription,
        is_ai_processed: true,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.log('[analyzeItem] supabase update failed', updateError);
      throw updateError;
    }

    console.log('[analyzeItem] updated item', updatedItem);
    res.json({
      display_name: displayName,
      ai_description: aiDescription,
      item: updatedItem,
    });
  } catch (err) {
    console.error('[analyzeItem] AI analysis error', err);
    res.status(500).json({ error: err.message || 'AI analysis failed' });
  }
};

// Approve an item (Admin)
const approveItem = async (req, res) => {
  const { id } = req.params;
  const { display_name, ai_description, is_ai_processed } = req.body;
  try {
    const updateData = { status: 'approved' };
    if (display_name !== undefined) updateData.display_name = display_name;
    if (ai_description !== undefined) updateData.ai_description = ai_description;
    if (is_ai_processed === true) updateData.is_ai_processed = true;

    const { data, error } = await supabase
      .from('items')
      .update(updateData)
      .eq('id', id)
      .eq('status', 'pending')
      .select();

    if (error) throw error;
    if (!data || data.length === 0)
      return res.status(404).json({ error: 'Item not found or already processed' });

    res.json({ message: 'Item approved', item: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Reject an item (Admin)
const rejectItem = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('items')
      .update({ status: 'rejected' })
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0)
      return res.status(404).json({ error: 'Item not found or already processed' });

    res.json({ message: 'Item rejected', item: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Claim an item (Student or Admin)
const claimItem = async (req, res) => {
  const { id } = req.params;
  const { studentEmail } = req.body;
  const performedBy = studentEmail || 'Admin';
  try {
    const { data, error } = await supabase
      .from('items')
      .update({ status: 'claimed', claimed_by: performedBy })
      .eq('id', id)
      .eq('status', 'approved')
      .select();

    if (error) throw error;
    if (!data || data.length === 0)
      return res.status(404).json({ error: 'Item not found or already claimed' });

    const itemUuid = data[0].id;
    console.log("Logging action for item:", itemUuid);

    const { error: logError } = await supabase.from('item_logs').insert([{
      item_id: itemUuid,
      action: 'claimed',
      performed_by: performedBy,
      timestamp: new Date().toISOString()
    }]);

    if (logError) console.error("Failed to log action:", logError);

    res.json({ message: 'Item claimed successfully', item: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Request to claim an item (Student)
const requestClaim = async (req, res) => {
  const { id } = req.params;
  const { studentEmail, pickupNotes } = req.body;

  if (!studentEmail) {
    return res.status(400).json({ error: 'Student email is required' });
  }

  try {
    // Check if item exists and is approved
    const { data: itemData, error: itemError } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .eq('status', 'approved')
      .single();

    if (itemError || !itemData) {
      return res.status(404).json({ error: 'Item not found or not available for claiming' });
    }

    // Log the claim request with pickup notes
    const { error: logError } = await supabase.from('item_logs').insert([{
      item_id: id,
      action: 'claim_requested',
      performed_by: studentEmail,
      timestamp: new Date().toISOString()
    }]);

    if (logError) {
      console.error("Failed to log claim request:", logError);
      // Continue anyway, don't fail the request
    }

    res.json({ message: 'Claim request submitted successfully' });
  } catch (err) {
    console.error('Error processing claim request:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get pending claim requests
const getClaimRequests = async (req, res) => {
  try {
    // Get all claim_requested logs
    const { data: allRequests, error } = await supabase
      .from('item_logs')
      .select('id, item_id, performed_by, timestamp')
      .eq('action', 'claim_requested')
      .order('timestamp', { ascending: false });

    if (error) throw error;

    // Get all approved/rejected claim logs
    const { data: processedLogs, error: processedError } = await supabase
      .from('item_logs')
      .select('item_id')
      .in('action', ['claim_approved', 'claim_rejected']);

    if (processedError) throw processedError;

    const processedItemIds = new Set(processedLogs.map(log => log.item_id));

    // Filter out processed requests
    const pendingRequests = allRequests.filter(req => !processedItemIds.has(req.item_id));

    // Get item details for each pending request
    const claimRequests = [];
    for (const req of pendingRequests) {
      const { data: item, error: itemError } = await supabase
        .from('items')
        .select('display_name, name')
        .eq('id', req.item_id)
        .single();

      if (!itemError && item) {
        claimRequests.push({
          id: req.id,
          item_id: req.item_id,
          display_name: item.display_name || item.name,
          student_email: req.performed_by,
          pickup_notes: '', // TODO: Add details column to item_logs table
          timestamp: req.timestamp
        });
      }
    }

    res.json(claimRequests);
  } catch (err) {
    console.error('Error fetching claim requests:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Approve a claim request
const approveClaim = async (req, res) => {
  const { id } = req.params; // item id

  try {
    // Update item status to claimed
    const { data: itemData, error: itemError } = await supabase
      .from('items')
      .update({ status: 'claimed' })
      .eq('id', id)
      .eq('status', 'approved')
      .select();

    if (itemError) throw itemError;
    if (!itemData || itemData.length === 0) {
      return res.status(404).json({ error: 'Item not found or not in approved status' });
    }

    // Log the approval
    const { error: logError } = await supabase.from('item_logs').insert([{
      item_id: id,
      action: 'claim_approved',
      performed_by: 'Admin',
      timestamp: new Date().toISOString()
    }]);

    if (logError) console.error("Failed to log claim approval:", logError);

    res.json({ message: 'Claim approved successfully', item: itemData[0] });
  } catch (err) {
    console.error('Error approving claim:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Reject a claim request
const rejectClaim = async (req, res) => {
  const { id } = req.params; // item id

  try {
    // Item status remains approved, just log the rejection
    const { error: logError } = await supabase.from('item_logs').insert([{
      item_id: id,
      action: 'claim_rejected',
      performed_by: 'Admin',
      timestamp: new Date().toISOString()
    }]);

    if (logError) throw logError;

    res.json({ message: 'Claim rejected successfully' });
  } catch (err) {
    console.error('Error rejecting claim:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  uploadItem,
  getItems,
  analyzeItem,
  blindSearchMatch,
  submitLostReport,
  getLostReports,
  approveMatch,
  rejectMatch,
  sendCustomNotification,
  sendStudentUpdate,
  approveItem,
  rejectItem,
  claimItem,
  requestClaim,
  getClaimRequests,
  approveClaim,
  rejectClaim
};