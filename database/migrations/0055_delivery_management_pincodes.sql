-- 0055_delivery_management_pincodes.sql
-- Delivery Management (Part B): a local Tamil Nadu pincode -> lat/lng
-- table, since there is no free "list all pincodes of a state" API —
-- only lookup-by-pincode (api.postalpincode.in/pincode/{pincode}) and
-- search-by-office-name. scripts/seed_tn_pincodes.php populates this by
-- looping the whole 600001-643999 TN numeric range once; lat/lng are
-- geocoded lazily (first real checkout use, or a slow background
-- pre-geocode pass) via Nominatim, never bulk/eagerly, to respect its
-- usage policy.
CREATE TABLE IF NOT EXISTS tn_pincodes (
    pincode VARCHAR(6) NOT NULL PRIMARY KEY,
    office_name VARCHAR(150) NULL,
    district VARCHAR(100) NULL,
    block VARCHAR(100) NULL,
    state VARCHAR(100) NULL,
    lat DECIMAL(10,7) NULL,
    lng DECIMAL(10,7) NULL,
    -- 'pending' = row exists (from the India Post API) but not yet
    -- geocoded; 'nominatim' = a real forward-geocode hit; 'district_centroid'
    -- = Nominatim failed/returned nothing, fell back to the district's
    -- approximate centroid below (distance_km is then only approximate).
    geocode_source ENUM('pending', 'nominatim', 'district_centroid') NOT NULL DEFAULT 'pending',
    fetched_at DATETIME NULL,
    geocoded_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tn_pincodes_district (district)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fallback centroid per Tamil Nadu district, used only when a pincode's
-- own Nominatim geocode fails/returns nothing (PincodeGeocodingService).
-- Approximate town-level coordinates — good enough for a same-state
-- radius/weight delivery estimate, not surveyed precision.
CREATE TABLE IF NOT EXISTS district_centroids (
    district VARCHAR(100) NOT NULL PRIMARY KEY,
    lat DECIMAL(10,7) NOT NULL,
    lng DECIMAL(10,7) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO district_centroids (district, lat, lng) VALUES
    ('Ariyalur', 11.1401, 79.0782),
    ('Chengalpattu', 12.6921, 79.9765),
    ('Chennai', 13.0827, 80.2707),
    ('Coimbatore', 11.0168, 76.9558),
    ('Cuddalore', 11.7480, 79.7714),
    ('Dharmapuri', 12.1274, 78.1584),
    ('Dindigul', 10.3624, 77.9695),
    ('Erode', 11.3410, 77.7172),
    ('Kallakurichi', 11.7400, 78.9597),
    ('Kanchipuram', 12.8342, 79.7036),
    ('Kanyakumari', 8.1725, 77.4198),
    ('Karur', 10.9601, 78.0766),
    ('Krishnagiri', 12.5186, 78.2137),
    ('Madurai', 9.9252, 78.1198),
    ('Mayiladuthurai', 11.1037, 79.6530),
    ('Nagapattinam', 10.7656, 79.8424),
    ('Namakkal', 11.2189, 78.1677),
    ('Nilgiris', 11.4064, 76.6932),
    ('Perambalur', 11.2342, 78.8807),
    ('Pudukkottai', 10.3833, 78.8167),
    ('Ramanathapuram', 9.3639, 78.8395),
    ('Ranipet', 12.9249, 79.3308),
    ('Salem', 11.6643, 78.1460),
    ('Sivaganga', 9.8474, 78.4827),
    ('Tenkasi', 8.9601, 77.3152),
    ('Thanjavur', 10.7870, 79.1378),
    ('Theni', 10.0104, 77.4768),
    ('Thoothukudi', 8.7642, 78.1348),
    ('Tiruchirappalli', 10.7905, 78.7047),
    ('Tirunelveli', 8.7139, 77.7567),
    ('Tirupathur', 12.4950, 78.5678),
    ('Tiruppur', 11.1085, 77.3411),
    ('Tiruvallur', 13.1231, 79.9120),
    ('Tiruvannamalai', 12.2253, 79.0747),
    ('Tiruvarur', 10.7661, 79.6345),
    ('Vellore', 12.9165, 79.1325),
    ('Viluppuram', 11.9401, 79.4861),
    ('Virudhunagar', 9.5851, 77.9622)
ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng);
