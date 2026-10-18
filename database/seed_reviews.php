<?php

declare(strict_types=1);

require dirname(__DIR__) . '/backend/vendor/autoload.php';

use Dotenv\Dotenv;

Dotenv::createImmutable(dirname(__DIR__) . '/backend')->safeLoad();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '3306';
$name = $_ENV['DB_NAME'] ?? 'unified_pos';
$user = $_ENV['DB_USER'] ?? 'root';
$pass = $_ENV['DB_PASS'] ?? '';

$pdo = new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

// Truncate existing reviews if any, to ensure clean seed
$pdo->exec('DELETE FROM customer_reviews');

// Sample customer IDs
$customerIds = $pdo->query('SELECT id FROM customers')->fetchAll(PDO::FETCH_COLUMN);

// Product-specific customized reviews
$reviewsData = [
    // 1: Cotton T-Shirt
    1 => [
        [
            'name' => 'Karthik Subramanian',
            'rating' => 5,
            'title' => 'Super soft breathable cotton!',
            'comment' => 'The fabric is 100% combed cotton, fits true to size and feels very premium. Washed it twice already, no shrinkage or color bleeding.',
            'days_ago' => 4,
            'helpful' => 19,
        ],
        [
            'name' => 'Priya Raman',
            'rating' => 4,
            'title' => 'Great daily wear tee',
            'comment' => 'Very comfortable for summer weather. Clean stitching around the collar and sleeves. Highly recommend for casual outings.',
            'days_ago' => 11,
            'helpful' => 12,
        ],
        [
            'name' => 'Arun Kumar M.',
            'rating' => 5,
            'title' => 'Excellent quality at this price',
            'comment' => 'Fabric feels soft against skin. Color matches the product photos exactly. Fast delivery within 24 hours!',
            'days_ago' => 18,
            'helpful' => 8,
        ],
        [
            'name' => 'Vigneshwaran P.',
            'rating' => 4,
            'title' => 'Comfortable and stylish',
            'comment' => 'Good fabric quality and nice cut. Size runs slightly relaxed, so order your exact size.',
            'days_ago' => 25,
            'helpful' => 3,
        ],
    ],

    // 2: Coffee Mug
    2 => [
        [
            'name' => 'Divya Mohan',
            'rating' => 5,
            'title' => 'Perfect morning coffee companion',
            'comment' => 'Ceramic finish is glossy, smooth, and stain-free. Microwave safe and the handle remains cool even with boiling hot coffee.',
            'days_ago' => 3,
            'helpful' => 22,
        ],
        [
            'name' => 'Rajesh Kannan',
            'rating' => 4,
            'title' => 'Solid build & ergonomic grip',
            'comment' => 'Good heavy ceramic weight, feels durable in hand. Holds around 350ml easily, perfect for filter coffee or cappuccino.',
            'days_ago' => 14,
            'helpful' => 7,
        ],
        [
            'name' => 'Meena Venkat',
            'rating' => 5,
            'title' => 'Beautiful aesthetics & packaging',
            'comment' => 'Bought 2 for gifting. Excellent protective bubble wrap packaging, arrived without a single scratch or chip.',
            'days_ago' => 28,
            'helpful' => 15,
        ],
    ],

    // 3: Test Steel Bottle
    3 => [
        [
            'name' => 'Siddharth Raj',
            'rating' => 5,
            'title' => 'Keeps water ice cold for 18+ hours!',
            'comment' => 'Tested this in hot weather; filled with ice water in morning and it stayed cold till late night. High grade food safe stainless steel.',
            'days_ago' => 6,
            'helpful' => 28,
        ],
        [
            'name' => 'Harish Parameswaran',
            'rating' => 4,
            'title' => 'Completely leak-proof cap',
            'comment' => 'I carry this daily in my laptop bag. Zero leaks, wide mouth makes it easy to add ice cubes and clean with brush.',
            'days_ago' => 17,
            'helpful' => 11,
        ],
        [
            'name' => 'Suresh Babu',
            'rating' => 5,
            'title' => 'Sturdy and durable build',
            'comment' => 'Durable powder coat finish does not scratch easily. No metallic odor or taste.',
            'days_ago' => 32,
            'helpful' => 9,
        ],
    ],

    // 4: Cozy Hoodie
    4 => [
        [
            'name' => 'Ananya Krishnan',
            'rating' => 5,
            'title' => 'Extremely warm with ultra-soft fleece',
            'comment' => 'The inner brushed fleece is wonderfully soft. Kept me warm during cold morning rides. Zippers and drawstrings are top notch.',
            'days_ago' => 5,
            'helpful' => 24,
        ],
        [
            'name' => 'Deepan Chakravarthy',
            'rating' => 4,
            'title' => 'Trendy modern fit',
            'comment' => 'Looks modern and premium. Kangaroo pockets are deep and warm. Sleeve cuffs fit snugly without stretching out.',
            'days_ago' => 19,
            'helpful' => 14,
        ],
        [
            'name' => 'Gayathri Natarajan',
            'rating' => 5,
            'title' => 'Best hoodie purchase this season',
            'comment' => 'Color does not fade after wash. Highly comfortable for lounge wear and casual travel.',
            'days_ago' => 35,
            'helpful' => 10,
        ],
    ],

    // 5: Ceramic Plate
    5 => [
        [
            'name' => 'Lakshmi Narayanan',
            'rating' => 5,
            'title' => 'Fine dining restaurant aesthetic',
            'comment' => 'Glossy pristine white finish with subtle edge detailing. Scratch resistant against stainless steel spoons and knives.',
            'days_ago' => 8,
            'helpful' => 16,
        ],
        [
            'name' => 'Radhika Swaminathan',
            'rating' => 4,
            'title' => 'Microwave and dishwasher friendly',
            'comment' => 'Cleans easily without retaining oily curry stains or turmeric color. Has a nice sturdy weight.',
            'days_ago' => 22,
            'helpful' => 8,
        ],
        [
            'name' => 'Dr. A. Venkatesh',
            'rating' => 5,
            'title' => 'Exceptional quality crockery',
            'comment' => 'Arrived flawlessly packed in shock-proof thermocol. Elegant addition to the dinner table.',
            'days_ago' => 40,
            'helpful' => 6,
        ],
    ],

    // 6: coco cola
    6 => [
        [
            'name' => 'Naveen Raj',
            'rating' => 5,
            'title' => 'Classic crisp carbonation!',
            'comment' => 'Delivered ice-cold in under 30 minutes! The classic effervescence and refreshing kick on a hot afternoon is simply unbeatable.',
            'days_ago' => 1,
            'helpful' => 31,
        ],
        [
            'name' => 'Subash Chandran',
            'rating' => 5,
            'title' => 'Fresh stock with long expiry',
            'comment' => 'Fresh manufacturing date and original fizz. Great service by KiranaBazaar delivery partner.',
            'days_ago' => 9,
            'helpful' => 14,
        ],
        [
            'name' => 'Ramesh Pandian',
            'rating' => 4,
            'title' => 'Chilled and undamaged',
            'comment' => 'Came in chilled condition, perfectly sealed. Perfect drink for family movie night.',
            'days_ago' => 15,
            'helpful' => 9,
        ],
    ],

    // 8: T-Shirt
    8 => [
        [
            'name' => 'Balaji Kesavan',
            'rating' => 5,
            'title' => 'Durable everyday crew neck',
            'comment' => 'Solid fabric quality, does not get thin or transparent. Collar holds its shape nicely throughout the day.',
            'days_ago' => 7,
            'helpful' => 11,
        ],
        [
            'name' => 'Senthil Nathan',
            'rating' => 4,
            'title' => 'Great for evening gym workouts',
            'comment' => 'Good sweat absorbency and breathable knit. Good value for money basic apparel.',
            'days_ago' => 20,
            'helpful' => 5,
        ],
        [
            'name' => 'Muthuvel Periasamy',
            'rating' => 4,
            'title' => 'Comfortable relaxed fit',
            'comment' => 'Color stayed bright after detergent wash. Recommended for daily casual rotation.',
            'days_ago' => 38,
            'helpful' => 4,
        ],
    ],

    // 10: tshirt
    10 => [
        [
            'name' => 'Manoj Kumar V.',
            'rating' => 5,
            'title' => 'Clean look and lightweight',
            'comment' => 'Very soft against sensitive skin. Lightweight weave that stays cool even in humid climate.',
            'days_ago' => 10,
            'helpful' => 8,
        ],
        [
            'name' => 'Vijay Anand',
            'rating' => 4,
            'title' => 'Accurate size and rich color',
            'comment' => 'Matches the photo color precisely. Seamless stitching under arms, no chafing.',
            'days_ago' => 24,
            'helpful' => 4,
        ],
    ],

    // 11 to 16: Collect Test Products
    11 => [
        [
            'name' => 'Kavitha S.',
            'rating' => 5,
            'title' => 'Authentic item & prompt delivery',
            'comment' => 'Genuine product with sealed batch sticker. Everything works as advertised, smooth checkout experience.',
            'days_ago' => 5,
            'helpful' => 7,
        ],
        [
            'name' => 'Saravana Kumar',
            'rating' => 4,
            'title' => 'Good product quality',
            'comment' => 'Packaging was neat and secure. Meets all quality expectations.',
            'days_ago' => 16,
            'helpful' => 3,
        ],
    ],
    12 => [
        [
            'name' => 'Anand Gopal',
            'rating' => 5,
            'title' => 'Satisfied with the purchase',
            'comment' => 'Quality is dependable and finish is clean. Customer support was also helpful on delivery updates.',
            'days_ago' => 8,
            'helpful' => 9,
        ],
        [
            'name' => 'Revathi M.',
            'rating' => 4,
            'title' => 'Value for money',
            'comment' => 'Neatly packaged and delivered on schedule. Good build and reliable performance.',
            'days_ago' => 21,
            'helpful' => 4,
        ],
    ],
    13 => [
        [
            'name' => 'Senthil Vadivel',
            'rating' => 5,
            'title' => 'Smooth experience',
            'comment' => 'Quick shipping and good product condition. Genuine branded quality.',
            'days_ago' => 12,
            'helpful' => 6,
        ],
        [
            'name' => 'Bhavani Shankar',
            'rating' => 4,
            'title' => 'Works well as expected',
            'comment' => 'Accurate description on website. Arrived in sealed packaging.',
            'days_ago' => 27,
            'helpful' => 2,
        ],
    ],
    14 => [
        [
            'name' => 'Karthikeyan D.',
            'rating' => 5,
            'title' => 'Dependable quality',
            'comment' => 'Good finish and durability. Matches specifications listed on the details page.',
            'days_ago' => 11,
            'helpful' => 5,
        ],
        [
            'name' => 'Nalini R.',
            'rating' => 4,
            'title' => 'Pleased with fast delivery',
            'comment' => 'Ordered in morning and received by evening. Good purchase.',
            'days_ago' => 29,
            'helpful' => 3,
        ],
    ],
    15 => [
        [
            'name' => 'Gowtham Raj',
            'rating' => 5,
            'title' => 'Solid item and good service',
            'comment' => 'Item arrived in pristine box. Reliable quality check before dispatch.',
            'days_ago' => 14,
            'helpful' => 8,
        ],
        [
            'name' => 'Vasantha Kumari',
            'rating' => 4,
            'title' => 'Very good value',
            'comment' => 'Good material and durable build. Would buy again.',
            'days_ago' => 31,
            'helpful' => 4,
        ],
    ],
    16 => [
        [
            'name' => 'Dhanasekaran B.',
            'rating' => 5,
            'title' => 'Clean packaging and reliable item',
            'comment' => 'Top notch service and genuine product. Very happy with the overall store experience.',
            'days_ago' => 9,
            'helpful' => 7,
        ],
        [
            'name' => 'Madhumitha K.',
            'rating' => 4,
            'title' => 'Met expectations',
            'comment' => 'Good product, delivered safely and matches specifications.',
            'days_ago' => 26,
            'helpful' => 3,
        ],
    ],

    // 19: Fortune Chakki Fresh Whole Wheat Atta 5kg
    19 => [
        [
            'name' => 'Bhuvaneswari R.',
            'rating' => 5,
            'title' => 'Makes super soft and fluffy rotis!',
            'comment' => 'Rotis stay soft even when packed in the lunchbox till late evening. 100% whole wheat aroma, no maida adulteration. Kneads so smoothly!',
            'days_ago' => 2,
            'helpful' => 38,
        ],
        [
            'name' => 'Srinivasan Kalyanaraman',
            'rating' => 5,
            'title' => 'Fresh chakki batch with clean grains',
            'comment' => 'We have been ordering this monthly. Freshly packed batch delivered with 6 months validity. Very clean atta without husks or debris.',
            'days_ago' => 7,
            'helpful' => 24,
        ],
        [
            'name' => 'Jayanthi Natarajan',
            'rating' => 4,
            'title' => 'Great water absorption and texture',
            'comment' => 'High fiber content makes it very healthy for daily family consumption. Makes excellent phulkas and parathas.',
            'days_ago' => 15,
            'helpful' => 16,
        ],
        [
            'name' => 'Saravanan Muthusamy',
            'rating' => 5,
            'title' => 'Authentic whole wheat flavor',
            'comment' => 'Best chakki fresh atta in the market. Consistent milling quality every single time.',
            'days_ago' => 24,
            'helpful' => 11,
        ],
    ],

    // 20: Maggi 2-Minute Masala Instant Noodles 420g (Pack of 6)
    20 => [
        [
            'name' => 'Shilpa Nair',
            'rating' => 5,
            'title' => 'The eternal favorite comfort food!',
            'comment' => 'Nothing beats original Maggi Masala noodles! 6-pack is super convenient and economical for evening snack hunger pangs.',
            'days_ago' => 1,
            'helpful' => 45,
        ],
        [
            'name' => 'Rohit Verma',
            'rating' => 5,
            'title' => 'Noodles arrived intact, not crushed!',
            'comment' => 'Usually online deliveries crush the noodles inside the pack, but KiranaBazaar boxed it securely. Cakes were completely intact.',
            'days_ago' => 5,
            'helpful' => 29,
        ],
        [
            'name' => 'Kavitha Sundaram',
            'rating' => 4,
            'title' => 'Quick 5-minute delicious snack',
            'comment' => 'Classic spice mix with aromatic tastemaker. Added some sweet corn and capsicum for a quick tasty dinner.',
            'days_ago' => 13,
            'helpful' => 18,
        ],
        [
            'name' => 'Dinesh Ramanathan',
            'rating' => 5,
            'title' => 'Great value multipack',
            'comment' => 'Delivered in under 25 minutes. Fresh stock with 8 months expiry left. Will definitely order again.',
            'days_ago' => 21,
            'helpful' => 12,
        ],
    ],

    // 21: Fortune Sunlite Refined Sunflower Oil 1 Litre Pouch
    21 => [
        [
            'name' => 'Malathi Swaminathan',
            'rating' => 5,
            'title' => 'Light, clear, and healthy cooking oil',
            'comment' => 'Doesn’t leave heavy greasy residue or burnt smell. Perfect for deep frying snacks like pooris and making everyday vegetable poriyal.',
            'days_ago' => 3,
            'helpful' => 31,
        ],
        [
            'name' => 'Raghuram Ganesan',
            'rating' => 5,
            'title' => 'Genuine sealed pouch, zero leakage',
            'comment' => 'Pouch was delivered in an individual leak-proof sleeve. Fresh golden oil enriched with Vitamins A & D.',
            'days_ago' => 10,
            'helpful' => 19,
        ],
        [
            'name' => 'Hemalatha Parthasarathy',
            'rating' => 4,
            'title' => 'Very low smoke point and clear taste',
            'comment' => 'Food absorbs less oil and tastes crisp. We have been using Fortune Sunlite for heart healthy cooking.',
            'days_ago' => 20,
            'helpful' => 11,
        ],
    ],

    // 22: Dettol Original Germ Protection Bathing Bar (125g x 3 Multipack)
    22 => [
        [
            'name' => 'Dr. K. Ramanathan',
            'rating' => 5,
            'title' => 'Trusted clinical germ protection',
            'comment' => 'Signature pine fragrance that keeps you feeling energized and germ-free. Ideal for daily bathing after outdoor commutes.',
            'days_ago' => 4,
            'helpful' => 27,
        ],
        [
            'name' => 'Gomathi Sundar',
            'rating' => 5,
            'title' => 'Long-lasting soap bars with rich lather',
            'comment' => 'Does not turn soggy or dissolve quickly in the soap tray. 125g large bars last for weeks with thick cleansing lather.',
            'days_ago' => 12,
            'helpful' => 17,
        ],
        [
            'name' => 'Vimal Raj S.',
            'rating' => 4,
            'title' => 'Best value multipack deal',
            'comment' => 'Much cheaper than supermarket price. Sealed 3-in-1 combo with fresh crisp scent.',
            'days_ago' => 26,
            'helpful' => 8,
        ],
    ],

    // 23: Nivea Men Dark Spot Reduction Face Wash 100ml
    23 => [
        [
            'name' => 'Aditya Venkataraman',
            'rating' => 5,
            'title' => 'Instant freshness & intense oil control',
            'comment' => 'Deeply cleanses dirt and pollution after daily bike riding. Keeps face oil-free for 6-8 hours without drying out skin.',
            'days_ago' => 3,
            'helpful' => 33,
        ],
        [
            'name' => 'Pradeep Kumar S.',
            'rating' => 4,
            'title' => 'Noticeable glow and dark spot reduction',
            'comment' => 'Using it for 3 weeks twice daily; dark blemishes around cheeks have visibly lightened. Refreshing masculine fragrance.',
            'days_ago' => 14,
            'helpful' => 21,
        ],
        [
            'name' => 'Santhosh Kannan',
            'rating' => 5,
            'title' => 'Small drop creates rich foam',
            'comment' => 'Only a pea-sized drop is needed. Tube easily lasts 2 months. 100% genuine product delivered.',
            'days_ago' => 29,
            'helpful' => 12,
        ],
    ],

    // 24: Amul Pasteurized Salted Butter 500g (Product 24 from screenshot!)
    24 => [
        [
            'name' => 'Nandini Iyer',
            'rating' => 5,
            'title' => 'The undisputed king of butter!',
            'comment' => 'Nothing on earth compares to the taste of Amul butter melting over hot dosas, parathas, and morning toast. Pure golden delight with the iconic balanced salted kick.',
            'days_ago' => 2,
            'helpful' => 52,
        ],
        [
            'name' => 'Sundarrajan Mani',
            'rating' => 5,
            'title' => 'Delivered ice-cold in insulated pack!',
            'comment' => 'I was worried butter would melt in transit, but KiranaBazaar packed it with insulated cold gel packs! The 500g brick was solid and firm. Exemplary grocery delivery service!',
            'days_ago' => 6,
            'helpful' => 41,
        ],
        [
            'name' => 'Aarthi Gopinath',
            'rating' => 5,
            'title' => 'Irreplaceable for baking and cooking',
            'comment' => 'Creamy rich texture that folds smoothly into cookie dough and gives garlic bread that unmistakable restaurant aroma. Essential pantry staple.',
            'days_ago' => 11,
            'helpful' => 27,
        ],
        [
            'name' => 'Vikramaditya Raghavan',
            'rating' => 4,
            'title' => 'Classic Amul flavor we all grew up with',
            'comment' => 'Great value 500g block. Stays fresh in butter dish. Consistent quality across generations.',
            'days_ago' => 18,
            'helpful' => 19,
        ],
        [
            'name' => 'Sumathi Krishnan',
            'rating' => 5,
            'title' => 'Fresh batch manufactured just last week',
            'comment' => 'Delivered within 30 minutes! Creamy spreadable texture and delicious fresh dairy aroma.',
            'days_ago' => 25,
            'helpful' => 14,
        ],
    ],

    // 25: Tata Salt Vacuum Evaporated Iodised Salt 1kg
    25 => [
        [
            'name' => 'Muruganandam Selvam',
            'rating' => 5,
            'title' => 'Desh ka namak - pure, fine, and unadulterated',
            'comment' => 'Free flowing crystal fine salt. Dissolves instantly in soups and gravies with zero sediments or grit. The only salt brand we trust.',
            'days_ago' => 4,
            'helpful' => 26,
        ],
        [
            'name' => 'Pushpa Rajan',
            'rating' => 5,
            'title' => 'Optimal iodine balance for health',
            'comment' => 'Vacuum evaporated technology makes it pristine clean and snow white. Pack arrived completely air-tight and dry.',
            'days_ago' => 13,
            'helpful' => 15,
        ],
        [
            'name' => 'Ashok Kumar T.',
            'rating' => 4,
            'title' => 'Pure and dependable quality',
            'comment' => 'Standard household essential at reasonable price. Convenient 1kg pack.',
            'days_ago' => 27,
            'helpful' => 7,
        ],
    ],

    // 26: Tata Tea Gold Fragrant Long Leaves Tea 500g
    26 => [
        [
            'name' => 'Geetha Krishnan',
            'rating' => 5,
            'title' => 'Mesmerizing aroma and rich golden liquor!',
            'comment' => 'The gently rolled long tea leaves unfurl when brewing, filling the kitchen with an exquisite aroma. Rich taste with milk, ginger, and cardamom.',
            'days_ago' => 2,
            'helpful' => 39,
        ],
        [
            'name' => 'Vasudevan Thangavel',
            'rating' => 5,
            'title' => 'The ultimate morning cup of chai',
            'comment' => 'Strong yet remarkably smooth, without harsh bitter tannins. One teaspoon gives 2 cups of aromatic kadak chai.',
            'days_ago' => 8,
            'helpful' => 28,
        ],
        [
            'name' => 'Swaminathan Lakshmanan',
            'rating' => 4,
            'title' => 'Premium tea blend',
            'comment' => 'Foil sealed packaging retains fresh tea garden fragrance. Highly recommended for true tea lovers.',
            'days_ago' => 19,
            'helpful' => 17,
        ],
    ],

    // 27: Dabur Red Ayurvedic Toothpaste 300g (Save Pack)
    27 => [
        [
            'name' => 'Janaki Ramanathan',
            'rating' => 5,
            'title' => 'Potent herbal oral protection',
            'comment' => 'The clove, pudina, and herbal formulation gives prolonged fresh breath and relieves tooth sensitivity. No bleeding gums since using this.',
            'days_ago' => 5,
            'helpful' => 25,
        ],
        [
            'name' => 'Mohan Dass',
            'rating' => 5,
            'title' => 'Traditional ayurvedic power',
            'comment' => 'Feels clean and invigorating in the morning. Natural ingredients are gentle on enamel and gums.',
            'days_ago' => 15,
            'helpful' => 18,
        ],
        [
            'name' => 'Revathi Sekar',
            'rating' => 4,
            'title' => 'Great value 300g family tube',
            'comment' => 'Huge tube lasts a long time. Distinct herbal spicy-mint flavor leaves mouth feeling genuinely clean.',
            'days_ago' => 28,
            'helpful' => 9,
        ],
    ],

    // 28: Britannia Good Day Cashew & Butter Cookies 200g (Pack of 2)
    28 => [
        [
            'name' => 'Lavanya Sundaram',
            'rating' => 5,
            'title' => 'Loaded with crunchy roasted cashews!',
            'comment' => 'Every single cookie has visible real cashew chunks. Melts in mouth with rich butter flavor. Perfect tea-time snack for family.',
            'days_ago' => 1,
            'helpful' => 44,
        ],
        [
            'name' => 'Arvind Swamy K.',
            'rating' => 5,
            'title' => 'Delivered crisp without breaking',
            'comment' => 'Crisp crunch in every bite, not a single crushed biscuit in the pack. Great cushioning by the delivery team.',
            'days_ago' => 7,
            'helpful' => 30,
        ],
        [
            'name' => 'Deepa Chandrasekhar',
            'rating' => 4,
            'title' => 'Irresistible buttery taste',
            'comment' => 'Smells wonderful as soon as the foil wrapper is opened. 2-pack combo is great value for money.',
            'days_ago' => 17,
            'helpful' => 13,
        ],
    ],

    // 29: Amul Delicious Cheese Slices 200g (10 Slices)
    29 => [
        [
            'name' => 'Varun Kashyap',
            'rating' => 5,
            'title' => 'Melts into velvety perfection!',
            'comment' => 'The best cheese slices for grilled sandwiches and burgers. Melts evenly into a creamy, golden blanket. Easy peel packaging on each slice.',
            'days_ago' => 3,
            'helpful' => 35,
        ],
        [
            'name' => 'Poornima Venkatesh',
            'rating' => 5,
            'title' => 'Kids love it on morning toast',
            'comment' => 'Rich wholesome dairy taste. Individual foil wraps keep slices fresh and prevent sticking together.',
            'days_ago' => 9,
            'helpful' => 22,
        ],
        [
            'name' => 'Chandrasekar Madhavan',
            'rating' => 4,
            'title' => 'Cold pack delivery preserved quality',
            'comment' => 'Arrived fresh and chilled. Slices are thick and flavorful. Perfect for making quick breakfast egg cheese rolls.',
            'days_ago' => 22,
            'helpful' => 15,
        ],
    ],

    // 30: Dabur 100% Pure & Natural Forest Honey 500g Squeezy
    30 => [
        [
            'name' => 'Shanthi Balasubramanian',
            'rating' => 5,
            'title' => 'Pure thick honey with no-mess squeezy bottle',
            'comment' => 'The silicone anti-drip squeezy nozzle is ingenious! Zero sticky bottle neck or messy spoons. Honey is dark, thick, and genuinely pure.',
            'days_ago' => 4,
            'helpful' => 41,
        ],
        [
            'name' => 'Prakash Narayanan',
            'rating' => 5,
            'title' => 'Natural morning detox elixir',
            'comment' => 'Mixes smoothly in warm water with fresh lemon juice. Subtle floral sweetness without artificial sugar crystals at the bottom.',
            'days_ago' => 12,
            'helpful' => 26,
        ],
        [
            'name' => 'Karpagam Duraisamy',
            'rating' => 4,
            'title' => 'High quality and pure',
            'comment' => 'NMR tested purity makes us feel safe giving to kids. Great natural sweetener for desserts and herbal teas.',
            'days_ago' => 26,
            'helpful' => 14,
        ],
    ],
];

// Verify products exist and insert
$stmt = $pdo->prepare(
    "INSERT INTO customer_reviews 
     (product_id, customer_id, customer_name, customer_avatar, rating, title, comment, is_verified_purchase, helpful_count, status, created_at)
     VALUES (:product_id, :customer_id, :customer_name, :customer_avatar, :rating, :title, :comment, :is_verified_purchase, :helpful_count, 'APPROVED', :created_at)"
);

$insertedCount = 0;
$allProducts = $pdo->query('SELECT id, name FROM products ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC);

foreach ($allProducts as $prod) {
    $pId = (int) $prod['id'];
    $reviews = $reviewsData[$pId] ?? null;

    // Fallback diverse reviews if not explicitly defined above
    if (!$reviews) {
        $reviews = [
            [
                'name' => 'Senthil Kumar',
                'rating' => 5,
                'title' => 'Great quality and genuine product',
                'comment' => "Authentic {$prod['name']} received in excellent condition. Packaging was clean and sealed.",
                'days_ago' => rand(2, 6),
                'helpful' => rand(10, 25),
            ],
            [
                'name' => 'Pavithra Mohan',
                'rating' => 4,
                'title' => 'Very satisfied with the item',
                'comment' => "Delivered quickly by KiranaBazaar. The {$prod['name']} matches description exactly and works well.",
                'days_ago' => rand(8, 18),
                'helpful' => rand(5, 14),
            ],
            [
                'name' => 'Rajendran V.',
                'rating' => 5,
                'title' => 'Prompt delivery & good value',
                'comment' => "Quality tested and verified. Happy with this purchase.",
                'days_ago' => rand(20, 35),
                'helpful' => rand(2, 8),
            ],
        ];
    }

    foreach ($reviews as $idx => $r) {
        $customerId = !empty($customerIds) ? $customerIds[$idx % count($customerIds)] : null;
        $createdAt = date('Y-m-d H:i:s', strtotime("-{$r['days_ago']} days - " . ($idx * 3) . " hours"));
        
        $stmt->execute([
            'product_id' => $pId,
            'customer_id' => $customerId,
            'customer_name' => $r['name'],
            'customer_avatar' => null,
            'rating' => $r['rating'],
            'title' => $r['title'],
            'comment' => $r['comment'],
            'is_verified_purchase' => 1,
            'helpful_count' => $r['helpful'],
            'created_at' => $createdAt,
        ]);
        $insertedCount++;
    }
}

echo "Successfully seeded {$insertedCount} diverse customer reviews across " . count($allProducts) . " products!\n";
