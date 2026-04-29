/**
 * Storage configuration utility
 * Provides URLs for images stored in Supabase Storage
 */

function getDefaultImageUrl() {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/items/default.png`;
}

function getSupabaseStorageBaseUrl() {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/items`;
}

module.exports = {
  getDefaultImageUrl,
  getSupabaseStorageBaseUrl,
};
