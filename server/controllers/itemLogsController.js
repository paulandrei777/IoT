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

const createItemLog = async (req, res) => {
  try {
    const { item_id, action, performed_by, timestamp } = req.body || {};

    if (!item_id || !action || !performed_by) {
      return res.status(400).json({
        error: 'item_id, action, and performed_by are required'
      });
    }

    const payload = {
      item_id,
      action,
      performed_by,
      timestamp: timestamp || new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('item_logs')
      .insert([payload])
      .select();

    if (error) throw error;

    res.status(201).json(data?.[0] || payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getItemLogs, createItemLog };