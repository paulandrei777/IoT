const supabase = require('../config/supabaseClient');

const uploadItem = async (req, res) => {
  try {
    const { name, fileBase64 } = req.body;
    const fileName = `${Date.now()}_${name}.png`;

    // Upload image to Supabase storage bucket 'items'
    const { data: storageData, error: storageError } = await supabase.storage
      .from('items')
      .upload(fileName, Buffer.from(fileBase64, 'base64'), {
        contentType: 'image/png',
        upsert: true,
      });

    if (storageError) throw storageError;

    const imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/items/${fileName}`;

    // Insert into database
    const { data: dbData, error: dbError } = await supabase
      .from('items')
      .insert([{ name, image_url: imageUrl, status: 'pending' }])
      .select();

    if (dbError) throw dbError;

    res.json({ message: 'Item uploaded successfully!', item: dbData[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

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