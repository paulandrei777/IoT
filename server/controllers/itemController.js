// server/controllers/itemController.js
const supabase = require("../config/supabaseClient");

// Upload item
const uploadItem = async (req, res) => {
  try {
    const { name, fileBase64 } = req.body; // IoT device sends base64 image
    const fileName = `${Date.now()}_${name}.png`;

    // Upload to Supabase Storage (bucket: 'items')
    const { data: storageData, error: storageError } = await supabase.storage
      .from("items")
      .upload(fileName, Buffer.from(fileBase64, "base64"), {
        contentType: "image/png",
        upsert: true, // overwrite if file exists
      });

    if (storageError) throw storageError;

    // Construct public URL for the uploaded file
    const projectUrl = "https://oytfdethkubdbgnvgexr.supabase.co"; // <-- replace with your project URL
    const imageUrl = `${projectUrl}/storage/v1/object/public/items/${fileName}`;

    // Insert metadata into Supabase table
    const { data: dbData, error: dbError } = await supabase
      .from("items")
      .insert([{ name, image_url: imageUrl, status: "pending" }])
      .select(); // select() returns inserted row

    if (dbError) throw dbError;

    res.json({ message: "Item uploaded successfully!", item: dbData[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Get all items
const getItems = async (req, res) => {
  try {
    const { data, error } = await supabase.from("items").select("*");
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { uploadItem, getItems };