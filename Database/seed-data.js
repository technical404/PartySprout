'use strict';

/**
 * Reference data for the directory.
 * Categories, country and cities live in the database and are never hardcoded in the views.
 * No business listings are seeded - the listings table stays empty on purpose.
 */

const CATEGORIES = [
  { slug: 'superheroes', name: 'Superheroes', icon: '🦸', tagline: 'Caped crusaders and comic heroes for every party' },
  { slug: 'mascots', name: 'Mascots', icon: '🐻', tagline: 'Friendly costumed mascots and walk-around characters' },
  { slug: 'princesses', name: 'Princesses', icon: '👑', tagline: 'Storybook princesses, royal hosts and tea parties' },
  { slug: 'star-wars', name: 'Star Wars', icon: '🚀', tagline: 'Jedi, droids and galactic characters' },
  { slug: 'non-mascots', name: 'Non Mascots', icon: '🎭', tagline: 'Face performers, lookalikes and hosts without a full costume' },
  { slug: 'clowns', name: 'Clowns', icon: '🤡', tagline: 'Balloon twisters, comedy clowns and party clowns' },
  { slug: 'pirates', name: 'Pirates', icon: '🏴‍☠️', tagline: 'Swashbuckling pirates and treasure-hunt adventures' },
  { slug: 'holidays', name: 'Holidays', icon: '🎄', tagline: 'Santa, Easter, Halloween and seasonal characters' },
  { slug: 'fairy', name: 'Fairy', icon: '🧚', tagline: 'Fairies, pixies and enchanted garden friends' },
  { slug: 'magicians', name: 'Magicians', icon: '🎩', tagline: 'Close-up magic, stage shows and illusionists' }
];

/**
 * Editorial specialty labels per category, surfaced on the homepage category
 * cards. Deliberately generic wording: no trade-dressed character names.
 */
const SUBCATEGORIES = {
  superheroes: [
    'Superhero Lookalikes',
    'Superhero Training Parties',
    'Web-Slinger Heroes',
    'Caped Crusaders',
    'Superhero Costume Rental',
    'Superhero Party Hosts'
  ],
  mascots: [
    'Animal Mascots',
    'Sports Mascots',
    'Walk-Around Mascots',
    'Custom Mascots',
    'Mascot Rentals'
  ],
  princesses: [
    'Princess Lookalikes',
    'Royal Tea Parties',
    'Princess Hosts',
    'Storybook Princesses',
    'Princess Makeovers'
  ],
  'star-wars': [
    'Jedi Training',
    'Space Villains',
    'Droid Characters',
    'Galactic Lookalikes',
    'Lightsaber Parties'
  ],
  'non-mascots': [
    'Face Characters',
    'Lookalike Performers',
    'Party Hosts',
    'Singing Telegrams',
    'Character Greeters'
  ],
  clowns: [
    'Comedy Clowns',
    'Balloon Twisters',
    'Party Clowns',
    'Face Painting Clowns',
    'Circus Clowns'
  ],
  pirates: [
    'Pirate Captains',
    'Treasure Hunt Adventures',
    'Pirate Games & Music',
    'Swashbuckler Hosts'
  ],
  holidays: [
    'Santa Visits',
    'Easter Bunny Visits',
    'Halloween Characters',
    'Holiday Elves',
    'Holiday Singers'
  ],
  fairy: [
    'Garden Fairies',
    'Pixie Hosts',
    'Enchanted Tea Parties',
    'Fairy Wings & Wands'
  ],
  magicians: [
    'Close-Up Magic',
    'Stage Shows',
    'Illusionists',
    'Kids Comedy Magic',
    'Balloon & Magic Combos'
  ]
};

const COUNTRY = { code: 'US', name: 'United States', dial_code: '+1' };

const STATES = {
  AL: ['Alabama', ['Birmingham', 'Montgomery', 'Mobile', 'Huntsville', 'Tuscaloosa', 'Auburn']],
  AK: ['Alaska', ['Anchorage', 'Fairbanks', 'Juneau', 'Sitka', 'Ketchikan', 'Wasilla']],
  AZ: ['Arizona', ['Phoenix', 'Tucson', 'Mesa', 'Scottsdale', 'Chandler', 'Glendale', 'Tempe', 'Flagstaff']],
  AR: ['Arkansas', ['Little Rock', 'Fort Smith', 'Fayetteville', 'Springdale', 'Jonesboro', 'Conway']],
  CA: ['California', ['Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Fresno', 'Sacramento', 'Long Beach', 'Oakland', 'Bakersfield', 'Anaheim', 'Santa Ana', 'Riverside', 'Irvine', 'San Bernardino']],
  CO: ['Colorado', ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood', 'Thornton', 'Pueblo', 'Boulder']],
  CT: ['Connecticut', ['Bridgeport', 'New Haven', 'Stamford', 'Hartford', 'Waterbury', 'Norwalk', 'Danbury']],
  DE: ['Delaware', ['Wilmington', 'Dover', 'Newark', 'Middletown', 'Smyrna', 'Georgetown']],
  DC: ['District of Columbia', ['Washington']],
  FL: ['Florida', ['Jacksonville', 'Miami', 'Tampa', 'Orlando', 'St. Petersburg', 'Hialeah', 'Tallahassee', 'Fort Lauderdale', 'Port St. Lucie', 'Cape Coral', 'Gainesville', 'Clearwater']],
  GA: ['Georgia', ['Atlanta', 'Columbus', 'Augusta', 'Macon', 'Savannah', 'Athens', 'Sandy Springs', 'Roswell']],
  HI: ['Hawaii', ['Honolulu', 'Hilo', 'Kailua', 'Kapolei', 'Kaneohe', 'Lahaina']],
  ID: ['Idaho', ['Boise', 'Meridian', 'Nampa', 'Idaho Falls', 'Pocatello', 'Caldwell']],
  IL: ['Illinois', ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford', 'Springfield', 'Peoria', 'Elgin', 'Evanston']],
  IN: ['Indiana', ['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel', 'Bloomington', 'Fishers']],
  IA: ['Iowa', ['Des Moines', 'Cedar Rapids', 'Davenport', 'Sioux City', 'Iowa City', 'Waterloo']],
  KS: ['Kansas', ['Wichita', 'Overland Park', 'Kansas City', 'Topeka', 'Olathe', 'Lawrence']],
  KY: ['Kentucky', ['Louisville', 'Lexington', 'Bowling Green', 'Owensboro', 'Covington', 'Frankfort']],
  LA: ['Louisiana', ['New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette', 'Lake Charles', 'Metairie']],
  ME: ['Maine', ['Portland', 'Lewiston', 'Bangor', 'South Portland', 'Auburn', 'Biddeford']],
  MD: ['Maryland', ['Baltimore', 'Columbia', 'Germantown', 'Silver Spring', 'Waldorf', 'Frederick', 'Annapolis']],
  MA: ['Massachusetts', ['Boston', 'Worcester', 'Springfield', 'Lowell', 'Cambridge', 'New Bedford', 'Quincy', 'Brockton']],
  MI: ['Michigan', ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Ann Arbor', 'Lansing', 'Flint', 'Dearborn']],
  MN: ['Minnesota', ['Minneapolis', 'St. Paul', 'Rochester', 'Duluth', 'Bloomington', 'Brooklyn Park']],
  MS: ['Mississippi', ['Jackson', 'Gulfport', 'Southaven', 'Biloxi', 'Hattiesburg', 'Meridian']],
  MO: ['Missouri', ['Kansas City', 'St. Louis', 'Springfield', 'Columbia', 'Independence', "Lee's Summit"]],
  MT: ['Montana', ['Billings', 'Missoula', 'Great Falls', 'Bozeman', 'Butte', 'Helena']],
  NE: ['Nebraska', ['Omaha', 'Lincoln', 'Bellevue', 'Grand Island', 'Kearney', 'Fremont']],
  NV: ['Nevada', ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas', 'Sparks', 'Carson City']],
  NH: ['New Hampshire', ['Manchester', 'Nashua', 'Concord', 'Derry', 'Dover', 'Rochester']],
  NJ: ['New Jersey', ['Newark', 'Jersey City', 'Paterson', 'Elizabeth', 'Edison', 'Trenton', 'Camden']],
  NM: ['New Mexico', ['Albuquerque', 'Las Cruces', 'Rio Rancho', 'Santa Fe', 'Roswell', 'Farmington']],
  NY: ['New York', ['New York', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse', 'Albany', 'New Rochelle', 'Schenectady']],
  NC: ['North Carolina', ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem', 'Fayetteville', 'Asheville', 'Wilmington']],
  ND: ['North Dakota', ['Fargo', 'Bismarck', 'Grand Forks', 'Minot', 'West Fargo', 'Williston']],
  OH: ['Ohio', ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton', 'Parma']],
  OK: ['Oklahoma', ['Oklahoma City', 'Tulsa', 'Norman', 'Broken Arrow', 'Lawton', 'Edmond']],
  OR: ['Oregon', ['Portland', 'Salem', 'Eugene', 'Gresham', 'Hillsboro', 'Bend', 'Beaverton']],
  PA: ['Pennsylvania', ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading', 'Scranton', 'Harrisburg']],
  RI: ['Rhode Island', ['Providence', 'Cranston', 'Warwick', 'Pawtucket', 'Woonsocket', 'Newport']],
  SC: ['South Carolina', ['Charleston', 'Columbia', 'North Charleston', 'Mount Pleasant', 'Rock Hill', 'Greenville']],
  SD: ['South Dakota', ['Sioux Falls', 'Rapid City', 'Aberdeen', 'Brookings', 'Watertown', 'Mitchell']],
  TN: ['Tennessee', ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Clarksville', 'Murfreesboro', 'Franklin']],
  TX: ['Texas', ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth', 'El Paso', 'Arlington', 'Corpus Christi', 'Plano', 'Laredo', 'Lubbock', 'Frisco', 'McKinney']],
  UT: ['Utah', ['Salt Lake City', 'West Valley City', 'Provo', 'West Jordan', 'Orem', 'Sandy', 'Ogden']],
  VT: ['Vermont', ['Burlington', 'South Burlington', 'Rutland', 'Barre', 'Montpelier', 'Winooski']],
  VA: ['Virginia', ['Virginia Beach', 'Norfolk', 'Chesapeake', 'Richmond', 'Newport News', 'Alexandria', 'Arlington']],
  WA: ['Washington', ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue', 'Everett', 'Renton']],
  WV: ['West Virginia', ['Charleston', 'Huntington', 'Morgantown', 'Parkersburg', 'Wheeling', 'Weirton']],
  WI: ['Wisconsin', ['Milwaukee', 'Madison', 'Green Bay', 'Kenosha', 'Racine', 'Appleton', 'Eau Claire']],
  WY: ['Wyoming', ['Cheyenne', 'Casper', 'Laramie', 'Gillette', 'Rock Springs', 'Sheridan']]
};

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { CATEGORIES, SUBCATEGORIES, COUNTRY, STATES, slugify };
