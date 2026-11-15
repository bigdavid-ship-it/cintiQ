-- Allow product videos (MP4, WebM, MOV) alongside images in the product-images bucket.
update storage.buckets
set
  file_size_limit = 26214400, -- 25 MB
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
where id = 'product-images';
