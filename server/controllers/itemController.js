// server/controllers/itemController.js
const supabase = require('../config/supabaseClient');

// Upload an item (base64 from IoT device or client)
const uploadItem = async (req, res) => {
  try {
    const { name, fileBase64, type } = req.body; // IoT sends base64
    const fileType = type || 'image/png'; // default type
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

module.exports = { uploadItem, getItems };