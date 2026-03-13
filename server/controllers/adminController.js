const supabase = require('../config/supabaseClient');

const approveItem = async (req, res) => {
  const { id } = req.params;
  try {
    // Only update items that are pending
    const { data, error } = await supabase
      .from('items')
      .update({ status: 'approved' })
      .eq('id', id)
      .eq('status', 'pending') // only pending items can be approved
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Item not found or already approved/rejected' });
    }

    res.json({ message: 'Item approved', item: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const rejectItem = async (req, res) => {
  const { id } = req.params;
  const { deleteItem } = req.body;

  try {
    if (deleteItem) {
      const { data, error } = await supabase
        .from('items')
        .delete()
        .eq('id', id)
        .select(); // select() needed to get deleted row back

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Item not found or already deleted' });
      }

      return res.json({ message: 'Item deleted', item: data[0] });
    } else {
      // Reject the item regardless of current status
      const { data, error } = await supabase
        .from('items')
        .update({ status: 'rejected' })
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Item not found or already deleted' });
      }

      return res.json({ message: 'Item rejected', item: data[0] });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { approveItem, rejectItem };