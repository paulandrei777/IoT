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

    const itemUuid = data[0].id;
    console.log("Logging action for item:", itemUuid);

    const { error: logError } = await supabase.from('item_logs').insert([{
      item_id: itemUuid,
      action: 'approved',
      performed_by: 'admin@example.com',
      timestamp: new Date().toISOString()
    }]);

    if (logError) console.error("Failed to log action:", logError);

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

    const itemUuid = data[0].id;
    console.log("Logging action for item:", itemUuid);

    const { error: logError } = await supabase.from('item_logs').insert([{
      item_id: itemUuid,
      action: 'rejected',
      performed_by: 'admin@example.com',
      timestamp: new Date().toISOString()
    }]);

    if (logError) console.error("Failed to log action:", logError);

    res.json({ message: 'Item rejected', item: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Claim an item (Student)
const claimItem = async (req, res) => {
  const { id } = req.params;
  const { studentEmail } = req.body;
  try {
    const { data, error } = await supabase
      .from('items')
      .update({ status: 'claimed', claimed_by: studentEmail })
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
      performed_by: studentEmail,
      timestamp: new Date().toISOString()
    }]);

    if (logError) console.error("Failed to log action:", logError);

    res.json({ message: 'Item claimed successfully', item: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  uploadItem,
  getItems,
  approveItem,
  rejectItem,
  claimItem
};