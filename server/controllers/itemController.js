// server/controllers/itemController.js
const supabase = require('../config/supabaseClient');

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

// Approve an item (Admin)
const approveItem = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('items')
      .update({ status: 'approved' })
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
        .select('name')
        .eq('id', req.item_id)
        .single();

      if (!itemError && item) {
        claimRequests.push({
          id: req.id,
          item_id: req.item_id,
          item_name: item.name,
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
  approveItem,
  rejectItem,
  claimItem,
  requestClaim,
  getClaimRequests,
  approveClaim,
  rejectClaim
};