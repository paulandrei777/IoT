/**
 * Initializes default image in Supabase Storage
 * Run this once during server startup to ensure the default image exists
 */
const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabaseClient');

const DEFAULT_IMAGE_NAME = 'default.png';
const BUCKET_NAME = 'items';

async function initDefaultImage() {
  try {
    // 1. Create a minimal PNG image (1x1 transparent PNG)
    // This is a valid PNG encoded in base64
    const minimalPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 size
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, // bit depth, color type
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, // compressed data
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, // CRC
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
      0xae, 0x42, 0x60, 0x82                          // CRC
    ]);

    console.log('📦 [DEFAULT_IMAGE] Checking if default image exists in Supabase Storage...');

    // 2. Check if default image already exists
    const { data: existingFiles, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list('', { limit: 100 });

    if (listError) {
      console.error('❌ [DEFAULT_IMAGE] Failed to list files:', listError.message);
      return;
    }

    const defaultExists = existingFiles?.some(file => file.name === DEFAULT_IMAGE_NAME);

    if (defaultExists) {
      const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${DEFAULT_IMAGE_NAME}`;
      console.log(`✓ [DEFAULT_IMAGE] Default image already exists`);
      console.log(`  URL: ${publicUrl}`);
      return publicUrl;
    }

    // 3. Upload default image
    console.log('📤 [DEFAULT_IMAGE] Uploading default image to Supabase Storage...');
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(DEFAULT_IMAGE_NAME, minimalPng, {
        contentType: 'image/png',
        upsert: true, // Overwrite if it already exists
      });

    if (uploadError) {
      console.error('❌ [DEFAULT_IMAGE] Upload failed:', uploadError.message);
      return;
    }

    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${DEFAULT_IMAGE_NAME}`;
    console.log('✓ [DEFAULT_IMAGE] Default image uploaded successfully!');
    console.log(`  File: ${uploadData.path}`);
    console.log(`  URL: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error('❌ [DEFAULT_IMAGE] Error:', error.message);
  }
}

module.exports = { initDefaultImage };
