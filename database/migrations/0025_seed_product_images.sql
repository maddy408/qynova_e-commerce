-- Seed product_images table for products 1-18 so database is the single source of truth for catalog images
INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary, created_at)
SELECT * FROM (
    -- Product 1
    SELECT 1 AS product_id, 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=900&auto=format&fit=crop&q=80' AS image_path, NULL AS thumb_path, 0 AS sort_order, 1 AS is_primary, NOW() AS created_at
    UNION ALL SELECT 1, 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    UNION ALL SELECT 1, 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=900&auto=format&fit=crop&q=80', NULL, 2, 0, NOW()
    -- Product 2
    UNION ALL SELECT 2, 'https://images.unsplash.com/photo-1535295972055-1c762f4483e5?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 2, 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 3
    UNION ALL SELECT 3, 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 3, 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 4
    UNION ALL SELECT 4, 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 4, 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    UNION ALL SELECT 4, 'https://images.unsplash.com/photo-1611591475152-4732a1ad3294?w=900&auto=format&fit=crop&q=80', NULL, 2, 0, NOW()
    -- Product 5
    UNION ALL SELECT 5, 'https://images.unsplash.com/photo-1630019852942-f89202989a59?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 5, 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 6
    UNION ALL SELECT 6, 'https://images.unsplash.com/photo-1611591475152-4732a1ad3294?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 6, 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 7
    UNION ALL SELECT 7, 'https://images.unsplash.com/photo-1603006905003-be475563bc59?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 7, 'https://images.unsplash.com/photo-1508746829417-e6f548d8d6ed?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 8
    UNION ALL SELECT 8, 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 8, 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 9
    UNION ALL SELECT 9, 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 9, 'https://images.unsplash.com/photo-1558877385-81a1c7e67d72?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 10
    UNION ALL SELECT 10, 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 10, 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 11
    UNION ALL SELECT 11, 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 11, 'https://images.unsplash.com/photo-1597484661643-2f5fef640dd1?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 12
    UNION ALL SELECT 12, 'https://images.unsplash.com/photo-1597484661643-2f5fef640dd1?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 12, 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 13
    UNION ALL SELECT 13, 'https://images.unsplash.com/photo-1608248597359-2911b3323a67?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 13, 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 14
    UNION ALL SELECT 14, 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 14, 'https://images.unsplash.com/photo-1608248597359-2911b3323a67?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 15
    UNION ALL SELECT 15, 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 15, 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 16
    UNION ALL SELECT 16, 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 16, 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 17
    UNION ALL SELECT 17, 'https://images.unsplash.com/photo-1513094735237-8f2714d57c13?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 17, 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
    -- Product 18
    UNION ALL SELECT 18, 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=900&auto=format&fit=crop&q=80', NULL, 0, 1, NOW()
    UNION ALL SELECT 18, 'https://images.unsplash.com/photo-1513094735237-8f2714d57c13?w=900&auto=format&fit=crop&q=80', NULL, 1, 0, NOW()
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM product_images);
