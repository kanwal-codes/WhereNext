/* ==========================================================================
   BookMyGranthi — content & sample data

   IMPORTANT: every granthi, review and testimonial below is FICTIONAL
   sample data so the site can be designed and tested end to end.
   Replace GRANTHIS with real, verified people before launch (see README).
   ========================================================================== */
(function () {
  const CONFIG = {
    brand: 'BookMyGranthi',
    // Shows a slim "preview" bar at the top of every page. Set to false at launch.
    demo: true,
    // Optional: a URL that accepts JSON POSTs (Formspree, Getform, your API…).
    // Bookings, applications and messages are always saved in this browser;
    // if an endpoint is set they are ALSO sent there.
    endpoint: '',
    supportEmail: 'hello@bookmygranthi.com',
    year: 2026
  };

  /* ---------- Ceremony groups (browse by occasion) ---------- */
  const GROUPS = [
    { id: 'wedding', label: 'Weddings',         pa: 'ਆਨੰਦ ਕਾਰਜ',     blurb: 'Anand Karaj, the Sikh wedding ceremony.' },
    { id: 'birth',   label: 'Birth & naming',   pa: 'ਨਾਮਕਰਨ',        blurb: 'Naamkaran and thanksgiving for a new child.' },
    { id: 'funeral', label: 'Funerals',         pa: 'ਅੰਤਮ ਸੰਸਕਾਰ',   blurb: 'Antam Sanskar, and the Bhog that follows.' },
    { id: 'paath',   label: 'Paath',            pa: 'ਪਾਠ',            blurb: 'Akhand, Sehaj and Sukhmani Sahib Paath.' },
    { id: 'home',    label: 'Home & blessings', pa: 'ਗ੍ਰਿਹ ਪ੍ਰਵੇਸ਼',   blurb: 'New homes, new businesses, milestones.' },
    { id: 'kirtan',  label: 'Kirtan',           pa: 'ਕੀਰਤਨ',          blurb: 'Shabad Kirtan for any occasion.' }
  ];

  /* ---------- Ceremonies ---------- */
  // base = indicative suggested seva in GBP; converted per granthi (tier × currency).
  const SERVICES = [
    {
      id: 'anand-karaj', name: 'Anand Karaj', pa: 'ਆਨੰਦ ਕਾਰਜ', group: 'wedding', base: 450,
      duration: 'About 1½ – 2 hours',
      short: 'The Sikh wedding ceremony, solemnised before Guru Granth Sahib Ji.',
      long: 'Anand Karaj means “blissful union”. The couple are joined in the presence of Guru Granth Sahib Ji, led by the granthi, with Kirtan, Ardaas and the four Laavan hymns composed by Guru Ram Das Ji. The couple walk around Guru Granth Sahib Ji as each Laavan is read, and the ceremony closes with Anand Sahib, Ardaas and Karah Prashad.',
      expect: ['Opening Ardaas and a short explanation of the ceremony for guests', 'Instruction to the couple on the meaning of the Laavan', 'Four Laavan, each read then sung while the couple circle Guru Granth Sahib Ji', 'Anand Sahib, closing Ardaas, Hukamnama and Karah Prashad'],
      prepare: ['Confirm the gurdwara or venue and that Guru Granth Sahib Ji can be taken there', 'Agree the day’s timings with your granthi, Kirtani Jatha and family', 'Palla (scarf) for the couple, flowers and a Rumala for Guru Granth Sahib Ji', 'Gurdwara policies on mixed-faith couples vary, so raise this early with your granthi']
    },
    {
      id: 'akhand-path', name: 'Akhand Path', pa: 'ਅਖੰਡ ਪਾਠ', group: 'paath', base: 400,
      duration: 'About 48 hours, non-stop',
      short: 'An unbroken reading of Guru Granth Sahib Ji, start to finish.',
      long: 'Akhand Path is the continuous, uninterrupted recitation of all 1,430 Angs of Guru Granth Sahib Ji, completed in around 48 hours by a team of paathis who take turns reading. It is commonly held for weddings, new homes, new businesses, births, anniversaries and in times of difficulty. The Path begins with Ardaas and concludes with the Bhog.',
      expect: ['A team of paathis, usually in shifts, so the reading never stops', 'Prakash of Guru Granth Sahib Ji, Ardaas and the Hukamnama at the start', 'Bhog ceremony at the end, with Kirtan, Ardaas and Karah Prashad', 'Langar is usually served by the family for the Sangat at the Bhog'],
      prepare: ['A clean, quiet room set aside with a Palki Sahib and Chanani (canopy)', 'Somewhere for the paathis to rest and meals during the 48 hours', 'Karah Prashad ingredients for the Bhog', 'Confirm how many paathis your granthi brings and any travel needed']
    },
    {
      id: 'sehaj-path', name: 'Sehaj Path', pa: 'ਸਹਿਜ ਪਾਠ', group: 'paath', base: 220,
      duration: 'Paced over days or weeks',
      short: 'A complete reading of Guru Granth Sahib Ji at a gentle, steady pace.',
      long: 'Sehaj Path is a complete reading of Guru Granth Sahib Ji at an unhurried pace, with breaks, usually finished over seven to ten days or longer. It can be read by one paathi, by family members or together. It is also the Path most often held after a bereavement, concluding with the Bhog.',
      expect: ['Prakash of Guru Granth Sahib Ji at home or in a gurdwara', 'Daily reading at agreed times, often morning or evening', 'A concluding Bhog with Ardaas, Hukamnama and Karah Prashad'],
      prepare: ['A dedicated, respectful space and Palki Sahib at home', 'Agree a daily schedule that suits the family', 'Plan the date for the Bhog so relatives can gather']
    },
    {
      id: 'sukhmani-sahib', name: 'Sukhmani Sahib Path', pa: 'ਸੁਖਮਨੀ ਸਾਹਿਬ', group: 'paath', base: 110,
      duration: 'About 1½ – 2 hours',
      short: 'The “Psalm of Peace” composed by Guru Arjan Dev Ji.',
      long: 'Sukhmani Sahib is a composition of 24 Ashtpadis by Guru Arjan Dev Ji, recited for peace of mind, thanksgiving and blessing. A single sitting takes roughly one and a half to two hours and is a popular choice for a family gathering, a new beginning or a quiet day of reflection.',
      expect: ['Opening Ardaas', 'Complete Path of Sukhmani Sahib', 'Closing Ardaas and Karah Prashad'],
      prepare: ['A clean space with Guru Granth Sahib Ji or a Gutka Sahib', 'Family and friends are welcome to sit and listen', 'Karah Prashad to share at the end']
    },
    {
      id: 'naamkaran', name: 'Naamkaran', pa: 'ਨਾਮਕਰਨ', group: 'birth', base: 140,
      duration: 'About 1 hour',
      short: 'The naming ceremony for a newborn, guided by the Hukamnama.',
      long: 'Naamkaran is the Sikh naming ceremony. In the presence of Guru Granth Sahib Ji, the family gives thanks for the child, a Hukamnama is taken, and the first letter of the hymn guides the choice of name. Singh or Kaur is added to the name as the child’s family name.',
      expect: ['Opening Ardaas and a short Kirtan', 'Hukamnama taken and the first letter announced', 'The family chooses the name; the granthi announces it to the Sangat', 'Closing Ardaas and Karah Prashad'],
      prepare: ['Choose a few names beginning with likely letters if you wish', 'Have the child’s parents and grandparents present', 'Karah Prashad and, if you like, langar for guests']
    },
    {
      id: 'antam-sanskar', name: 'Antam Sanskar', pa: 'ਅੰਤਮ ਸੰਸਕਾਰ', group: 'funeral', base: 220,
      duration: 'About 1 – 2 hours',
      short: 'The Sikh funeral rites, led with dignity and care.',
      long: 'Antam Sanskar is the Sikh funeral ceremony. The family and Sangat gather for Ardaas, with Gurbani Kirtan and Kirtan Sohila at the cremation. The granthi guides the family through each step, and afterward through the Path and Bhog that follow in the days after. We know this is a difficult time, so many granthis on BookMyGranthi can respond at short notice.',
      expect: ['Guidance on the day for the family, so nothing is left to chance', 'Ardaas before the cremation and Kirtan Sohila at the end', 'Support arranging the Sehaj or Akhand Path that follows', 'A calm, respectful presence for the whole family'],
      prepare: ['Speak with your funeral director about timings and the crematorium', 'If you need a granthi urgently, mark your request as urgent', 'Think about whether to hold a Sehaj or Akhand Path and Bhog afterward']
    },
    {
      id: 'bhog', name: 'Bhog & Antim Ardaas', pa: 'ਭੋਗ', group: 'funeral', base: 170,
      duration: 'About 2 – 3 hours',
      short: 'The concluding ceremony after a Sehaj or Akhand Path.',
      long: 'Bhog marks the conclusion of a Path. After a bereavement it is the final gathering, where family and friends come to remember a loved one. It includes Kirtan, the final verses of Guru Granth Sahib Ji, Ardaas, the Hukamnama and Karah Prashad, followed by langar.',
      expect: ['Final verses read and Ardaas offered for the departed', 'Kirtan and, if you wish, short words of remembrance', 'Hukamnama, Karah Prashad and langar'],
      prepare: ['Agree the date and venue with the family', 'Plan langar and let the Sangat know the timings', 'Tell your granthi if there will be speakers']
    },
    {
      id: 'griha-parvesh', name: 'Griha Parvesh', pa: 'ਗ੍ਰਿਹ ਪ੍ਰਵੇਸ਼', group: 'home', base: 140,
      duration: 'About 1½ – 3 hours',
      short: 'A blessing for a new home or business.',
      long: 'Griha Parvesh is the thanksgiving and blessing for a new home or business. It is usually marked with a Path, often Sukhmani Sahib, Ardaas and the Hukamnama, so that the new space begins with gratitude.',
      expect: ['Ardaas of thanks as you enter the new space', 'A Path of your choice, often Sukhmani Sahib or Sehaj Path', 'Hukamnama and Karah Prashad'],
      prepare: ['A clean, prepared space for Guru Granth Sahib Ji', 'Tell your granthi the Path you would like', 'Plan langar or refreshments for guests']
    },
    {
      id: 'shukrana', name: 'Shukrana Ardaas', pa: 'ਸ਼ੁਕਰਾਨਾ ਅਰਦਾਸ', group: 'home', base: 70,
      duration: 'About 30 – 60 minutes',
      short: 'An Ardaas of thanks for birthdays, anniversaries, exams and fresh starts.',
      long: 'Shukrana means thanks. A Shukrana Ardaas is a short, simple ceremony to thank Waheguru for a milestone, such as a birthday, anniversary, graduation, safe travels or recovery from illness. It can be held at home or in the gurdwara.',
      expect: ['A short Path or Shabad', 'Ardaas of thanks', 'Hukamnama and Karah Prashad'],
      prepare: ['Let your granthi know the occasion and any names for the Ardaas', 'Karah Prashad to share with family']
    },
    {
      id: 'kirtan', name: 'Kirtan Sewa', pa: 'ਕੀਰਤਨ', group: 'kirtan', base: 220,
      duration: 'About 1 – 2 hours',
      short: 'Shabad Kirtan for your occasion, in traditional raag.',
      long: 'Kirtan is the singing of Gurbani with traditional instruments. Granthis listed for Kirtan can lead the Sangat in Shabad and Asa Ki Vaar for a wedding, Path, Bhog or celebration at home or in the gurdwara.',
      expect: ['Shabad Kirtan matched to your occasion', 'Traditional instruments (harmonium and tabla) where available', 'Ardaas and Hukamnama to close'],
      prepare: ['Tell your granthi the occasion and how long you’d like Kirtan', 'Check sound arrangements if you are in a hall']
    }
  ];

  /* ---------- Currency conversion for sample pricing ---------- */
  const FX = { GBP: 1, CAD: 1.75, USD: 1.28, AUD: 1.95 };

  /* ---------- Sample granthis (FICTIONAL) ---------- */
  const GRANTHIS = [
    {
      id: 'harjinder-singh-southall', honorific: 'Giani', name: 'Harjinder Singh',
      city: 'Southall', region: 'London', country: 'United Kingdom', currency: 'GBP', tier: 1.15,
      years: 24, langs: ['Punjabi', 'English', 'Hindi'], verified: true, shortNotice: true,
      rating: 4.9, ratingCount: 112, responds: 'within 2 hours', travel: 'Up to 40 miles from Southall',
      affiliation: 'Serves gurdwaras across West London',
      bio: 'Giani Harjinder Singh has led Anand Karaj and Akhand Path in and around West London for over two decades. He studied Gurmat Sangeet and Katha and is known for explaining each step of a ceremony in clear English and Punjabi so that every generation in the room feels included.\n\nHe is available at short notice for Antam Sanskar and is happy to speak with families beforehand to plan the day.',
      services: ['anand-karaj', 'akhand-path', 'sehaj-path', 'sukhmani-sahib', 'naamkaran', 'antam-sanskar', 'bhog', 'griha-parvesh'],
      reviews: [
        { name: 'Simran K.', place: 'Hounslow', service: 'anand-karaj', when: 'September 2026', text: 'Giani Ji explained every Laav in English so my in-laws understood and felt part of it. Calm, warm and completely on time.' },
        { name: 'The Gill family', place: 'Southall', service: 'antam-sanskar', when: 'July 2026', text: 'He arrived within hours and guided us through everything. We will always be grateful for the dignity he brought.' },
        { name: 'Manjit B.', place: 'Ealing', service: 'akhand-path', when: 'May 2026', text: 'Well organised team of paathis, clear communication throughout the 48 hours. Highly recommend.' }
      ]
    },
    {
      id: 'gurpreet-singh-birmingham', honorific: 'Bhai', name: 'Gurpreet Singh',
      city: 'Birmingham', region: 'West Midlands', country: 'United Kingdom', currency: 'GBP', tier: 1.0,
      years: 15, langs: ['Punjabi', 'English'], verified: true, shortNotice: true,
      rating: 4.8, ratingCount: 74, responds: 'within 3 hours', travel: 'Up to 35 miles from Handsworth',
      affiliation: 'Associated with a Handsworth gurdwara',
      bio: 'Bhai Gurpreet Singh began reading Path as a teenager and has served the Birmingham Sangat for fifteen years. He is a gentle, patient presence at home ceremonies and especially at Naamkaran and Griha Parvesh, where families often have many questions.',
      services: ['sehaj-path', 'sukhmani-sahib', 'naamkaran', 'antam-sanskar', 'bhog', 'griha-parvesh', 'shukrana'],
      reviews: [
        { name: 'Jaspreet R.', place: 'Smethwick', service: 'naamkaran', when: 'October 2026', text: 'So thoughtful with our newborn and the elders in the room. The Hukamnama gave us a beautiful name.' },
        { name: 'Harbans S.', place: 'Handsworth', service: 'sehaj-path', when: 'August 2026', text: 'Read with clear pronunciation and great respect. Our whole home felt at peace.' }
      ]
    },
    {
      id: 'manpreet-kaur-leicester', honorific: 'Bibi', name: 'Manpreet Kaur',
      city: 'Leicester', region: 'East Midlands', country: 'United Kingdom', currency: 'GBP', tier: 0.95,
      years: 11, langs: ['Punjabi', 'English'], verified: true, shortNotice: false,
      rating: 5.0, ratingCount: 48, responds: 'within a day', travel: 'Up to 30 miles from Leicester',
      affiliation: 'Leicester Sangat and home Paath',
      bio: 'Bibi Manpreet Kaur leads Sukhmani Sahib Path, Sehaj Path and Shukrana Ardaas for families across Leicester, and is a trained Kirtani. Many of her bookings are women’s Sangat gatherings and family milestones, and she is known for a warm, welcoming approach.',
      services: ['sukhmani-sahib', 'sehaj-path', 'shukrana', 'naamkaran', 'griha-parvesh', 'kirtan'],
      reviews: [
        { name: 'Ravinder K.', place: 'Leicester', service: 'sukhmani-sahib', when: 'October 2026', text: 'Beautiful, melodic reading. My mum sat with tears of joy.' },
        { name: 'Amrit D.', place: 'Oadby', service: 'shukrana', when: 'June 2026', text: 'We held a Shukrana for my daughter’s graduation. Warm, simple and perfect.' }
      ]
    },
    {
      id: 'sukhdev-singh-wolverhampton', honorific: 'Giani', name: 'Sukhdev Singh',
      city: 'Wolverhampton', region: 'West Midlands', country: 'United Kingdom', currency: 'GBP', tier: 1.05,
      years: 28, langs: ['Punjabi', 'Hindi', 'English'], verified: true, shortNotice: true,
      rating: 4.9, ratingCount: 131, responds: 'within 4 hours', travel: 'Up to 50 miles from Wolverhampton',
      affiliation: 'Former head granthi, Wolverhampton',
      bio: 'With nearly three decades of Sewa, Giani Sukhdev Singh is one of the most experienced granthis in the Midlands. He has led hundreds of Anand Karaj and Antam Sanskar and is trusted by many families across generations.',
      services: ['anand-karaj', 'akhand-path', 'sehaj-path', 'antam-sanskar', 'bhog', 'griha-parvesh', 'naamkaran'],
      reviews: [
        { name: 'Kuljit P.', place: 'Wolverhampton', service: 'anand-karaj', when: 'August 2026', text: 'Giani Ji married my parents and now me. Nobody does it with more grace.' },
        { name: 'The Sandhu family', place: 'Dudley', service: 'bhog', when: 'April 2026', text: 'A beautiful, moving Bhog. He found the right words for everyone.' }
      ]
    },
    {
      id: 'amarjit-singh-slough', honorific: 'Bhai', name: 'Amarjit Singh',
      city: 'Slough', region: 'Berkshire', country: 'United Kingdom', currency: 'GBP', tier: 0.95,
      years: 9, langs: ['Punjabi', 'English'], verified: false, shortNotice: true,
      rating: 4.7, ratingCount: 29, responds: 'within 5 hours', travel: 'Up to 30 miles from Slough',
      affiliation: 'Home Paath across the Thames Valley',
      bio: 'Bhai Amarjit Singh is a younger granthi who serves families across the Thames Valley with Sehaj Path, Sukhmani Sahib and Kirtan. He is happy to travel and is comfortable leading in both Punjabi and English.',
      services: ['sehaj-path', 'sukhmani-sahib', 'shukrana', 'kirtan', 'griha-parvesh'],
      reviews: [
        { name: 'Tej S.', place: 'Windsor', service: 'griha-parvesh', when: 'September 2026', text: 'He made our new home feel blessed. Gentle voice, very respectful.' }
      ]
    },
    {
      id: 'balwinder-singh-surrey', honorific: 'Giani', name: 'Balwinder Singh',
      city: 'Surrey', region: 'British Columbia', country: 'Canada', currency: 'CAD', tier: 1.0,
      years: 20, langs: ['Punjabi', 'English', 'Hindi'], verified: true, shortNotice: true,
      rating: 4.9, ratingCount: 96, responds: 'within 2 hours', travel: 'Greater Vancouver and Fraser Valley',
      affiliation: 'Serves gurdwaras across Surrey and Delta',
      bio: 'Giani Balwinder Singh has served the Surrey Sangat for twenty years, leading weddings, Akhand Path and Antam Sanskar. He is a fluent Katha speaker and is trusted by families who want a ceremony that feels both traditional and welcoming for younger generations.',
      services: ['anand-karaj', 'akhand-path', 'sehaj-path', 'sukhmani-sahib', 'naamkaran', 'antam-sanskar', 'bhog', 'griha-parvesh', 'shukrana'],
      reviews: [
        { name: 'Jasleen & Arjun', place: 'Surrey', service: 'anand-karaj', when: 'August 2026', text: 'Our wedding was exactly what we hoped for. Giani Ji’s Katha moved the whole room.' },
        { name: 'Parminder T.', place: 'Delta', service: 'akhand-path', when: 'June 2026', text: 'Professional, punctual and so respectful at every step.' }
      ]
    },
    {
      id: 'jasleen-kaur-brampton', honorific: 'Bibi', name: 'Jasleen Kaur',
      city: 'Brampton', region: 'Ontario', country: 'Canada', currency: 'CAD', tier: 0.95,
      years: 8, langs: ['Punjabi', 'English'], verified: true, shortNotice: false,
      rating: 4.9, ratingCount: 41, responds: 'within a day', travel: 'Greater Toronto Area',
      affiliation: 'Kirtani and Paathi, Brampton',
      bio: 'Bibi Jasleen Kaur trained in Gurmat Sangeet and offers Kirtan, Sukhmani Sahib and Sehaj Path across the GTA. She is especially loved for Naamkaran and Shukrana ceremonies, with a clear English explanation for younger families.',
      services: ['kirtan', 'sukhmani-sahib', 'sehaj-path', 'naamkaran', 'shukrana'],
      reviews: [
        { name: 'Navneet K.', place: 'Mississauga', service: 'naamkaran', when: 'September 2026', text: 'Her explanation in English made the ceremony meaningful for our friends too.' }
      ]
    },
    {
      id: 'kuldeep-singh-calgary', honorific: 'Bhai', name: 'Kuldeep Singh',
      city: 'Calgary', region: 'Alberta', country: 'Canada', currency: 'CAD', tier: 1.0,
      years: 13, langs: ['Punjabi', 'English', 'Hindi'], verified: true, shortNotice: true,
      rating: 4.8, ratingCount: 55, responds: 'within 4 hours', travel: 'Calgary and surrounding areas',
      affiliation: 'Serves gurdwaras across northeast Calgary',
      bio: 'Bhai Kuldeep Singh has served the Calgary Sangat for thirteen years, leading everything from Sehaj Path to Anand Karaj. He is a calm, dependable presence for Antam Sanskar and is available at short notice.',
      services: ['anand-karaj', 'sehaj-path', 'akhand-path', 'antam-sanskar', 'bhog', 'griha-parvesh'],
      reviews: [
        { name: 'The Dhillon family', place: 'Calgary', service: 'antam-sanskar', when: 'May 2026', text: 'Bhai Ji stayed with us throughout, steady and kind. Thank you.' }
      ]
    },
    {
      id: 'surjit-singh-fremont', honorific: 'Giani', name: 'Surjit Singh',
      city: 'Fremont', region: 'California', country: 'United States', currency: 'USD', tier: 1.1,
      years: 18, langs: ['Punjabi', 'English', 'Hindi'], verified: true, shortNotice: true,
      rating: 4.9, ratingCount: 88, responds: 'within 3 hours', travel: 'Bay Area, up to 60 miles',
      affiliation: 'Serves gurdwaras across the Bay Area',
      bio: 'Giani Surjit Singh has led Anand Karaj and Akhand Path in the Bay Area for eighteen years. A gifted Katha speaker, he explains each ceremony thoughtfully for guests who may be new to Sikh traditions.',
      services: ['anand-karaj', 'akhand-path', 'sehaj-path', 'sukhmani-sahib', 'naamkaran', 'antam-sanskar', 'bhog', 'griha-parvesh'],
      reviews: [
        { name: 'Preet & Dev', place: 'San Jose', service: 'anand-karaj', when: 'October 2026', text: 'He made our non-Sikh friends feel welcome and included. A beautiful ceremony.' },
        { name: 'Gurdeep S.', place: 'Hayward', service: 'akhand-path', when: 'July 2026', text: 'Excellent organisation and deep respect for maryada.' }
      ]
    },
    {
      id: 'harpreet-singh-queens', honorific: 'Bhai', name: 'Harpreet Singh',
      city: 'Queens', region: 'New York', country: 'United States', currency: 'USD', tier: 1.05,
      years: 12, langs: ['Punjabi', 'English'], verified: true, shortNotice: true,
      rating: 4.8, ratingCount: 63, responds: 'within 3 hours', travel: 'NYC, Long Island and New Jersey',
      affiliation: 'Associated with a Richmond Hill gurdwara',
      bio: 'Bhai Harpreet Singh serves families across New York City, Long Island and New Jersey, with a particular focus on Naamkaran, Griha Parvesh and Antam Sanskar. He is available at short notice and comfortable leading in English.',
      services: ['naamkaran', 'sehaj-path', 'sukhmani-sahib', 'antam-sanskar', 'bhog', 'griha-parvesh', 'shukrana'],
      reviews: [
        { name: 'Sandeep B.', place: 'Jersey City', service: 'naamkaran', when: 'September 2026', text: 'Clear, kind, and unhurried. A truly meaningful morning for our family.' }
      ]
    },
    {
      id: 'ravneet-kaur-chicago', honorific: 'Bibi', name: 'Ravneet Kaur',
      city: 'Chicago', region: 'Illinois', country: 'United States', currency: 'USD', tier: 1.0,
      years: 10, langs: ['Punjabi', 'English'], verified: true, shortNotice: false,
      rating: 4.9, ratingCount: 37, responds: 'within a day', travel: 'Chicagoland, up to 40 miles',
      affiliation: 'Kirtani and Paathi, Hanover Park',
      bio: 'Bibi Ravneet Kaur offers Sukhmani Sahib, Sehaj Path and Kirtan for families across Chicagoland. She is a trained Kirtani and leads many Sangat gatherings at home, with a gentle voice that families love.',
      services: ['sukhmani-sahib', 'sehaj-path', 'kirtan', 'shukrana', 'naamkaran'],
      reviews: [
        { name: 'Gurleen M.', place: 'Schaumburg', service: 'sukhmani-sahib', when: 'August 2026', text: 'A voice that fills the home with peace. We booked her again for my sister’s Shukrana.' }
      ]
    },
    {
      id: 'mohinder-singh-melbourne', honorific: 'Giani', name: 'Mohinder Singh',
      city: 'Melbourne', region: 'Victoria', country: 'Australia', currency: 'AUD', tier: 1.0,
      years: 22, langs: ['Punjabi', 'English', 'Hindi'], verified: true, shortNotice: true,
      rating: 4.9, ratingCount: 79, responds: 'within 3 hours', travel: 'Greater Melbourne',
      affiliation: 'Serves gurdwaras across Melbourne’s west and south-east',
      bio: 'Giani Mohinder Singh has served Melbourne’s Sikh community for over two decades, leading ceremonies from Anand Karaj to Antam Sanskar. He is known for patient, thorough preparation with families so that nothing is left uncertain on the day.',
      services: ['anand-karaj', 'akhand-path', 'sehaj-path', 'sukhmani-sahib', 'naamkaran', 'antam-sanskar', 'bhog', 'griha-parvesh'],
      reviews: [
        { name: 'Amandeep & Rohan', place: 'Tarneit', service: 'anand-karaj', when: 'October 2026', text: 'He walked us through everything beforehand. On the day we simply felt present.' },
        { name: 'Gagan S.', place: 'Dandenong', service: 'bhog', when: 'June 2026', text: 'A dignified and comforting Bhog for my father. Thank you, Giani Ji.' }
      ]
    }
  ];

  /* ---------- Testimonials (sample) ---------- */
  const TESTIMONIALS = [
    { text: 'We found a granthi for my father’s Antam Sanskar within hours, at a moment when we could barely think. It was one less thing to carry.', name: 'Gurinder S.', place: 'Southall' },
    { text: 'We booked Akhand Path for our new home in five minutes. The granthi called that evening and everything was exactly as agreed.', name: 'Amrit & Jas', place: 'Brampton' },
    { text: 'I live far from family and didn’t know whom to ask. The profiles, languages and prices made it feel easy and respectful.', name: 'Preeti K.', place: 'Fremont' }
  ];

  /* ---------- FAQ ---------- */
  const FAQ = [
    { q: 'How does booking work?', a: 'Find a granthi, choose the ceremony and a date, and send a booking request. The granthi reviews it and confirms, usually within a few hours. You will receive their confirmation by email and phone, and can speak to them directly to plan the details.' },
    { q: 'Do I pay when I book?', a: 'No. Sending a request is free and you do not pay anything through BookMyGranthi at the time of booking. The suggested seva shown on each profile is the granthi’s guideline, which you settle with them directly.' },
    { q: 'What does “suggested seva” mean?', a: 'Granthis offer their time as Sewa. We show a suggested amount so families know what to expect and can plan, without any awkward conversations. If a granthi needs to travel far, they will tell you of any extra before confirming.' },
    { q: 'What if it is urgent, such as a funeral?', a: 'Choose Antam Sanskar and look for granthis marked “short notice”. When you book, tick “this is urgent” and the granthi will be alerted straight away. If your request is time-critical, you can also contact us using the contact page.' },
    { q: 'Can the granthi come to my home or venue?', a: 'Yes. Most granthis travel to homes, banquet halls, gurdwaras and funeral venues within the area shown on their profile. You will choose the venue in the booking form.' },
    { q: 'How do you verify granthis?', a: 'Every granthi marked “Verified” has had their identity checked and has provided references from a gurdwara or community, and we review feedback from families. Not every granthi on the site is verified yet, and the profile always shows which are.' },
    { q: 'Can I cancel or change a booking?', a: 'Yes. Open “My bookings” to cancel a request, or contact the granthi directly to reschedule. Please give as much notice as you can so they can offer the date to another family.' },
    { q: 'I’m a granthi or paathi. Can I join?', a: 'Yes. Listing is free. Apply on the “For granthis” page and our team will be in touch to complete verification.' }
  ];

  /* ---------- Time slots ---------- */
  const SLOTS = [
    { id: 'early', label: 'Early morning', time: '5:00 – 8:00 am' },
    { id: 'morning', label: 'Morning', time: '8:00 am – 12:00 pm' },
    { id: 'afternoon', label: 'Afternoon', time: '12:00 – 4:00 pm' },
    { id: 'evening', label: 'Evening', time: '4:00 – 8:00 pm' }
  ];

  const VENUES = [
    { id: 'gurdwara', label: 'Gurdwara' },
    { id: 'home', label: 'Family home' },
    { id: 'hall', label: 'Banquet hall' },
    { id: 'funeral', label: 'Funeral home / crematorium' },
    { id: 'other', label: 'Somewhere else' }
  ];

  window.BMG_DATA = { CONFIG, GROUPS, SERVICES, GRANTHIS, TESTIMONIALS, FAQ, SLOTS, VENUES, FX };
})();
