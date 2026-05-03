// server/controllers/itemController.js
const supabase = require('../config/supabaseClient');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const fetchFn = global.fetch || (() => {
  throw new Error('Fetch is not available in this Node.js runtime. Please use Node 18+ or install a compatible fetch implementation.');
});

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is missing in .env');
}

const aiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const configuredGeminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const geminiModelCandidates = Array.from(new Set([
  configuredGeminiModel,
  'gemini-2.5-flash',
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

const simpleSimilarityScore = (a, b) => {
  const normalize = (value) => (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const tokensA = new Set(normalize(a));
  const tokensB = new Set(normalize(b));
  if (!tokensA.size || !tokensB.size) return 0;

  const intersection = [...tokensA].filter(token => tokensB.has(token)).length;
  return intersection / Math.max(tokensA.size, tokensB.size);
};

const calculateMatchScoresWithGemini = async (studentDescription, items) => {
  const candidates = items.slice(0, 20).map(item => ({
    id: item.id,
    ai_description: item.ai_description || '',
    display_name: item.display_name || '',
  }));

  const prompt = `You are a secure lost-and-found match assistant. Compare the student's item description against each stored item description below. Return only valid JSON with a root object containing a 'matches' array. Each item in the array must use the fields: id, match_score. The match_score must be an integer from 0 to 100. Do not include any additional text or explanation.\n\nstudent_description:\n${studentDescription.trim()}\n\nitems:\n${JSON.stringify(candidates, null, 2)}`;

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
      return parsed.matches.map(match => ({
        id: match.id,
        match_score: Number(match.match_score) || 0,
      }));
    }
  } catch (err) {
    console.warn('[calculateMatchScoresWithGemini] AI similarity fallback:', err.message || err);
  }

  return candidates.map(item => ({
    id: item.id,
    match_score: Math.round(simpleSimilarityScore(studentDescription, item.ai_description) * 100),
  }));
};

const blindSearchMatch = async (req, res) => {
  const { item_description } = req.body || {};
  if (!item_description || !item_description.trim()) {
    return res.status(400).json({ error: 'item_description is required' });
  }

  try {
    const { data: items, error } = await supabase
      .from('items')
      .select('id, display_name, ai_description')
      .eq('status', 'approved')
      .not('ai_description', 'is', null)
      .neq('ai_description', '')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const candidates = (items || []).filter(item => item.ai_description && item.ai_description.trim());
    if (!candidates.length) {
      return res.json({ matched_item_id: null, match_score: 0, message: 'No eligible items available for blind matching.' });
    }

    const matches = await calculateMatchScoresWithGemini(item_description, candidates);
    const bestMatch = matches.reduce((best, current) => current.match_score > best.match_score ? current : best, { id: null, match_score: 0 });
    const matchedItem = candidates.find(item => item.id === bestMatch.id);

    res.json({
      matched_item_id: bestMatch.id,
      match_score: bestMatch.match_score,
      matched_item_name: matchedItem?.display_name || null,
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

const approveMatch = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('lost_reports')
      .update({ status: 'matched' })
      .eq('id', id)
      .eq('status', 'pending')
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Report not found or already processed' });
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
      .update({ status: 'searching', matched_item_id: null, match_score: 0 })
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
  approveItem,
  rejectItem,
  claimItem,
  requestClaim,
  getClaimRequests,
  approveClaim,
  rejectClaim
};