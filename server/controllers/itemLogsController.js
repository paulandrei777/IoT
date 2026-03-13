const supabase = require('../config/supabaseClient');

const getItemLogs = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('item_logs')
      .select('*')
      .order('timestamp', { ascending: false }); // latest first

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getItemLogs };