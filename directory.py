"""Zenith Basic Knowledge Directory.

A lightweight, offline-capable Q&A store used for two things:
1. Offline Mode — users without a connection get instant answers from this local
   directory so Zenith stays useful without the network.
2. Online credit saving — before calling the paid AI, Zenith checks whether the
   user's question matches a directory entry and answers from it directly,
   reducing OpenRouter credit usage.

Each entry has keywords (lowercased) that a user message must contain, plus an
answer. The first entry whose keywords ALL appear in the message wins.
"""

DIRECTORY = [
    {
        "keywords": ["who created you", "who made you", "who built you", "your creator", "who is wanzu", "who created zenith"],
        "answer": "I'm Zenith, created by Wanzu Ibrahim. He designed me to be a helpful, accurate and loyal AI assistant ready to help with anything — chat, files, documents, images, code and more."
    },
    {
        "keywords": ["what is zenith", "who are you", "what are you", "about yourself", "tell me about yourself", "are you ai", "are you real"],
        "answer": "I'm Zenith — an AI assistant created by Wanzu Ibrahim. I can chat, write code, generate documents, edit files, create images, search the web and more. Ask me anything!"
    },
    {
        "keywords": ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", "howdy"],
        "answer": "Hello! I'm Zenith. How can I help you today?"
    },
    {
        "keywords": ["how are you", "how r u", "how are u", "how do you feel", "are you okay", "are you ok"],
        "answer": "I'm doing great, thank you! I don't have feelings like humans, but I'm fully online and ready to help. What can I do for you?"
    },
    {
        "keywords": ["what can you do", "help", "capabilities", "what are your capabilities", "features", "what do you do"],
        "answer": "Here's what I can do:\n\n- **Chat** — answer questions, have conversations\n- **Files** — upload, edit and manage documents\n- **Code** — write, run and explain code\n- **Documents** — generate formatted documents\n- **Images** — create images from descriptions\n- **Web search** — browse the internet for current info\n- **Memory** — remember things you tell me\n- **Knowledge bases** — learn from your custom data\n\nJust ask!"
    },
    {
        "keywords": ["bye", "goodbye", "see you", "good night", "gtg", "talk later"],
        "answer": "Goodbye! Take care — I'll be here whenever you need me."
    },
    {
        "keywords": ["thank you", "thanks", "thx", "ty", "appreciate it"],
        "answer": "You're very welcome! Happy to help anytime."
    },
    {
        "keywords": ["what time is it", "current time", "time now", "tell me the time", "whats the time", "what is the time"],
        "answer": "I can't read the clock directly, but your device shows the local time. If you're online, I can look up timezones with a web search when you enable the web button!"
    },
    {
        "keywords": ["what is your name", "your name", "what are you called", "who are you called"],
        "answer": "My name is **Zenith**! Created by Wanzu Ibrahim."
    },
    {
        "keywords": ["are you free", "are you paid", "how much does it cost", "is this free", "cost", "pricing", "price"],
        "answer": "Zenith has a free tier to get started. For extra power and features there are **Pro** and **Ultimate** plans — you can check them from the upgrade button in the sidebar for full details."
    },
    {
        "keywords": ["what is pro", "pro plan", "upgrade", "ultimate", "lifetime", "subscription"],
        "answer": "Zenith offers **Pro** and **Ultimate** plans (monthly, yearly or lifetime) with more features and higher limits. Tap the upgrade button in the sidebar to see all the details."
    },
    {
        "keywords": ["where is my data stored", "privacy", "is my data safe", "security", "data stored"],
        "answer": "Your chats, files and memories are stored by Zenith securely. You can delete chats at any time, and your data is only used to serve you better. For specifics, reach out to the platform owner."
    },
    {
        "keywords": ["i love you", "i hate you", "you are great", "you are the best", "you are smart"],
        "answer": "Thank you, that means a lot! I'm here to help around the clock."
    },
    {
        "keywords": ["what is today", "today's date", "date today", "what day is it", "whats today"],
        "answer": "I don't have a live calendar when offline. When you're back online I can search the web for the current date."
    },
    {
        "keywords": ["reset password", "forgot password", "change password", "password reset"],
        "answer": "You can reset your password from the login screen using 'Forgot password' with your username and email. If that doesn't work, an admin can reset it for you."
    },
    {
        "keywords": ["delete my account", "delete account", "cancel account"],
        "answer": "Account deletion is handled by administrators for safety. You can delete your chats anytime, and contact an admin if you need your account removed."
    },

    # === MATH CONCEPTS ===
    {"keywords": ["what is pi", "value of pi", "pi value", "how much is pi", "ratio of circumference"], "answer": "**Pi (pi) is approximately 3.14159265358979...** It is the ratio of a circle's circumference to its diameter."},
    {"keywords": ["value of e", "euler's number", "what is euler", "what is e in math"], "answer": "**Euler's number (e) is approximately 2.71828...** It is the base of natural logarithms and appears in compound interest, growth/decay, and many math formulas."},
    {"keywords": ["is zero even", "is 0 even", "is zero odd", "is 0 odd"], "answer": "**0 is an even number** because it is divisible by 2 with no remainder."},
    {"keywords": ["is 1 prime", "is one prime", "is 1 a prime number"], "answer": "**1 is NOT a prime number.** A prime number has exactly two distinct factors: 1 and itself. 1 only has one factor."},
    {"keywords": ["what is infinity", "value of infinity", "what is infinite"], "answer": "**Infinity is not a number** — it is a concept describing something without end or bound. In math, it is used in limits, set theory, and calculus."},
    {"keywords": ["what is 0 factorial", "0!", "zero factorial"], "answer": "**0! = 1**. By definition, the factorial of 0 equals 1."},
    {"keywords": ["what is 5 factorial", "5!", "five factorial"], "answer": "**5! = 5 x 4 x 3 x 2 x 1 = 120**"},
    {"keywords": ["what is 10 factorial", "10!", "ten factorial"], "answer": "**10! = 3,628,800**"},
    {"keywords": ["what is a percent", "how to calculate percentage", "what does percent mean"], "answer": "**Percent means 'per hundred.'** To calculate: (part / total) x 100 = percentage. Example: 25 out of 200 = (25/200) x 100 = 12.5%."},
    {"keywords": ["what is a fraction", "define fraction"], "answer": "**A fraction represents a part of a whole.** It has a numerator (top) and denominator (bottom). Example: 3/4 means 3 parts out of 4."},
    {"keywords": ["what is a decimal", "define decimal"], "answer": "**A decimal** is a number with a dot (.) separating the whole part from the fractional part. Example: 3.14 has 3 as whole number and 14 as the decimal part."},
    {"keywords": ["how to add fractions", "adding fractions"], "answer": "To **add fractions**: if same denominator, add numerators (3/8 + 2/8 = 5/8). If different denominators, find a common denominator first (1/2 + 1/3 = 3/6 + 2/6 = 5/6)."},
    {"keywords": ["what is a ratio", "define ratio"], "answer": "**A ratio** compares two quantities. Written as a:b or a/b. Example: the ratio of 2 to 3 is 2:3, meaning for every 2 of one thing, there are 3 of another."},
    {"keywords": ["what is the area of a circle", "area of circle formula"], "answer": "**Area of a circle = pi x r^2** (where r is the radius). Example: if r = 5, area = 3.14159 x 25 = 78.54."},
    {"keywords": ["what is the area of a triangle", "area of triangle formula"], "answer": "**Area of a triangle = (base x height) / 2**. Example: base = 10, height = 6, area = (10 x 6) / 2 = 30."},
    {"keywords": ["what is the area of a rectangle", "area of rectangle formula"], "answer": "**Area of a rectangle = length x width**. Example: length = 8, width = 5, area = 40."},
    {"keywords": ["what is the circumference of a circle", "circumference formula"], "answer": "**Circumference of a circle = 2 x pi x r** (where r is the radius). Or **pi x d** where d is the diameter."},
    {"keywords": ["what is the pythagorean theorem", "pythagoras theorem", "a2+b2=c2"], "answer": "**Pythagorean theorem: a^2 + b^2 = c^2**. In a right triangle, the square of the hypotenuse (c) equals the sum of squares of the other two sides (a and b)."},
    {"keywords": ["what is sin", "what is sine", "define sine"], "answer": "**Sine (sin)** is a trigonometric function. In a right triangle: sin(theta) = opposite / hypotenuse. For a unit circle, sin(theta) = the y-coordinate."},
    {"keywords": ["what is cos", "what is cosine", "define cosine"], "answer": "**Cosine (cos)** is a trigonometric function. In a right triangle: cos(theta) = adjacent / hypotenuse. For a unit circle, cos(theta) = the x-coordinate."},
    {"keywords": ["what is tan", "what is tangent", "define tangent"], "answer": "**Tangent (tan)** is a trigonometric function. tan(theta) = sin(theta) / cos(theta) = opposite / adjacent."},
    {"keywords": ["sin 90", "sin(90)", "sin of 90 degrees"], "answer": "**sin(90 degrees) = 1**"},
    {"keywords": ["cos 0", "cos(0)", "cos of 0 degrees"], "answer": "**cos(0 degrees) = 1**"},
    {"keywords": ["tan 45", "tan(45)", "tan of 45 degrees"], "answer": "**tan(45 degrees) = 1**"},

    # === ALGEBRA ===
    {"keywords": ["what is algebra", "define algebra", "explain algebra"], "answer": "**Algebra** is a branch of mathematics that uses letters (variables) and symbols to represent numbers and relationships. It lets us solve for unknown values. Example: if x + 3 = 7, then x = 4."},
    {"keywords": ["what is a variable", "define variable in math"], "answer": "**A variable** is a letter (like x, y, z) that represents an unknown number. It lets us write general formulas and equations."},
    {"keywords": ["what is a constant", "define constant in math"], "answer": "**A constant** is a fixed value that does not change. Examples: pi (3.14...), e (2.718...), or any number like 5."},
    {"keywords": ["what is a polynomial", "define polynomial"], "answer": "**A polynomial** is an expression with variables, coefficients, and non-negative integer exponents. Example: 3x^2 + 2x - 5. Degree = highest exponent: linear (1), quadratic (2), cubic (3)."},
    {"keywords": ["what is a quadratic equation", "define quadratic"], "answer": "**A quadratic equation** has the form ax^2 + bx + c = 0 (where a is not 0). Solve by factoring, completing the square, or the quadratic formula."},
    {"keywords": ["quadratic formula", "formula for quadratic"], "answer": "**x = (-b +/- sqrt(b^2 - 4ac)) / 2a**\n\nFor ax^2 + bx + c = 0.\n\nDiscriminant (b^2 - 4ac):\n- > 0: two real roots\n- = 0: one repeated root\n- < 0: two complex roots"},
    {"keywords": ["what is a linear equation", "define linear equation"], "answer": "**A linear equation** is an equation where the highest power of the variable is 1. It graphs as a straight line. Example: y = 2x + 3."},
    {"keywords": ["what is slope", "define slope", "how to find slope"], "answer": "**Slope** measures the steepness of a line. Formula: slope = (y2 - y1) / (x2 - x1) = rise / run."},
    {"keywords": ["what is y=mx+b", "slope intercept form", "y=mx+c"], "answer": "**y = mx + b** is the slope-intercept form. m = slope (steepness), b = y-intercept (where the line crosses the y-axis)."},
    {"keywords": ["what is factoring", "define factoring math"], "answer": "**Factoring** means breaking an expression into a product of simpler expressions. Example: x^2 - 9 = (x+3)(x-3). This is the difference of squares."},
    {"keywords": ["difference of squares", "a2-b2 formula"], "answer": "**a^2 - b^2 = (a+b)(a-b)**. This is one of the most important algebraic identities."},
    {"keywords": ["what is exponent", "define exponent"], "answer": "**An exponent** tells you how many times to multiply a number by itself. 2^3 = 2 x 2 x 2 = 8."},
    {"keywords": ["what is log", "what is logarithm", "define logarithm"], "answer": "**A logarithm** is the inverse of exponentiation. log base b of x = y means b^y = x. Common logs: log base 10, natural log (ln) uses base e."},
    {"keywords": ["what is ln", "natural log", "natural logarithm"], "answer": "**Natural logarithm (ln)** is the logarithm with base e (~2.718). ln(e) = 1, ln(1) = 0, ln(10) ~ 2.303."},
    {"keywords": ["what is sin squared plus cos squared", "sin2+cos2", "pythagorean identity"], "answer": "**sin^2(x) + cos^2(x) = 1** for any angle x. This is the fundamental Pythagorean trigonometric identity."},
    {"keywords": ["what is a function", "define function math"], "answer": "**A function** is a rule that assigns each input exactly one output. Written as f(x). Example: f(x) = x^2 means input x, output x squared."},
    {"keywords": ["what is a matrix", "define matrix"], "answer": "**A matrix** is a rectangular array of numbers arranged in rows and columns. Used in linear algebra, computer graphics, and data science."},
    {"keywords": ["what is the determinant", "determinant of a matrix"], "answer": "**The determinant** is a scalar value computed from a square matrix. For a 2x2 matrix [[a,b],[c,d]], the determinant = ad - bc."},

    # === WORLD CAPITALS ===
    {"keywords": ["capital of nigeria", "what is the capital of nigeria", "nigerian capital"], "answer": "**Abuja** is the capital of Nigeria (since 1991; the former capital was Lagos)."},
    {"keywords": ["capital of usa", "capital of united states", "what is the capital of america", "us capital", "american capital"], "answer": "**Washington, D.C.** is the capital of the United States."},
    {"keywords": ["capital of united kingdom", "capital of uk", "uk capital", "british capital"], "answer": "**London** is the capital of the United Kingdom."},
    {"keywords": ["capital of france", "french capital", "what is the capital of france"], "answer": "**Paris** is the capital of France."},
    {"keywords": ["capital of germany", "german capital", "what is the capital of germany"], "answer": "**Berlin** is the capital of Germany."},
    {"keywords": ["capital of japan", "japanese capital", "what is the capital of japan"], "answer": "**Tokyo** is the capital of Japan."},
    {"keywords": ["capital of china", "chinese capital", "what is the capital of china"], "answer": "**Beijing** is the capital of China."},
    {"keywords": ["capital of india", "indian capital", "what is the capital of india"], "answer": "**New Delhi** is the capital of India."},
    {"keywords": ["capital of brazil", "brazilian capital", "what is the capital of brazil"], "answer": "**Brasilia** is the capital of Brazil (since 1960; the former capital was Rio de Janeiro)."},
    {"keywords": ["capital of russia", "russian capital", "what is the capital of russia"], "answer": "**Moscow** is the capital of Russia."},
    {"keywords": ["capital of canada", "canadian capital", "what is the capital of canada"], "answer": "**Ottawa** is the capital of Canada."},
    {"keywords": ["capital of australia", "australian capital", "what is the capital of australia"], "answer": "**Canberra** is the capital of Australia (not Sydney or Melbourne as many assume)."},
    {"keywords": ["capital of egypt", "egyptian capital", "what is the capital of egypt"], "answer": "**Cairo** is the capital of Egypt."},
    {"keywords": ["capital of south africa", "south african capital"], "answer": "**Pretoria** (administrative), **Cape Town** (legislative), and **Bloemfontein** (judicial) — South Africa has three capitals."},
    {"keywords": ["capital of kenya", "kenyan capital", "what is the capital of kenya"], "answer": "**Nairobi** is the capital of Kenya."},
    {"keywords": ["capital of ghana", "ghanaian capital", "what is the capital of ghana"], "answer": "**Accra** is the capital of Ghana."},
    {"keywords": ["capital of ethiopia", "ethiopian capital", "what is the capital of ethiopia"], "answer": "**Addis Ababa** is the capital of Ethiopia."},
    {"keywords": ["capital of morocco", "moroccan capital", "what is the capital of morocco"], "answer": "**Rabat** is the capital of Morocco (not Casablanca)."},
    {"keywords": ["capital of south korea", "south korean capital", "korean capital"], "answer": "**Seoul** is the capital of South Korea."},
    {"keywords": ["capital of north korea", "north korean capital"], "answer": "**Pyongyang** is the capital of North Korea."},
    {"keywords": ["capital of turkey", "capital of turkiye", "turkish capital"], "answer": "**Ankara** is the capital of Turkey (not Istanbul)."},
    {"keywords": ["capital of saudi arabia", "saudi capital"], "answer": "**Riyadh** is the capital of Saudi Arabia."},
    {"keywords": ["capital of uae", "capital of united arab emirates", "emirati capital", "dubai capital"], "answer": "**Abu Dhabi** is the capital of the UAE (not Dubai)."},
    {"keywords": ["capital of israel", "israeli capital"], "answer": "**Jerusalem** is the declared capital of Israel (though many countries recognize Tel Aviv as the de facto capital)."},
    {"keywords": ["capital of iran", "iranian capital", "what is the capital of iran"], "answer": "**Tehran** is the capital of Iran."},
    {"keywords": ["capital of iraq", "iraqi capital", "what is the capital of iraq"], "answer": "**Baghdad** is the capital of Iraq."},
    {"keywords": ["capital of italy", "italian capital", "what is the capital of italy"], "answer": "**Rome** is the capital of Italy."},
    {"keywords": ["capital of spain", "spanish capital", "what is the capital of spain"], "answer": "**Madrid** is the capital of Spain."},
    {"keywords": ["capital of portugal", "portuguese capital", "what is the capital of portugal"], "answer": "**Lisbon** is the capital of Portugal."},
    {"keywords": ["capital of greece", "greek capital", "what is the capital of greece"], "answer": "**Athens** is the capital of Greece."},
    {"keywords": ["capital of poland", "polish capital", "what is the capital of poland"], "answer": "**Warsaw** is the capital of Poland."},
    {"keywords": ["capital of sweden", "swedish capital", "what is the capital of sweden"], "answer": "**Stockholm** is the capital of Sweden."},
    {"keywords": ["capital of norway", "norwegian capital", "what is the capital of norway"], "answer": "**Oslo** is the capital of Norway."},
    {"keywords": ["capital of denmark", "danish capital", "what is the capital of denmark"], "answer": "**Copenhagen** is the capital of Denmark."},
    {"keywords": ["capital of finland", "finnish capital", "what is the capital of finland"], "answer": "**Helsinki** is the capital of Finland."},
    {"keywords": ["capital of iceland", "icelandic capital", "what is the capital of iceland"], "answer": "**Reykjavik** is the capital of Iceland."},
    {"keywords": ["capital of mexico", "mexican capital", "what is the capital of mexico"], "answer": "**Mexico City** is the capital of Mexico."},
    {"keywords": ["capital of argentina", "argentine capital", "what is the capital of argentina"], "answer": "**Buenos Aires** is the capital of Argentina."},
    {"keywords": ["capital of colombia", "colombian capital", "what is the capital of colombia"], "answer": "**Bogota** is the capital of Colombia."},
    {"keywords": ["capital of peru", "peruvian capital", "what is the capital of peru"], "answer": "**Lima** is the capital of Peru."},
    {"keywords": ["capital of chile", "chilean capital", "what is the capital of chile"], "answer": "**Santiago** is the capital of Chile."},
    {"keywords": ["capital of venezuela", "venezuelan capital", "what is the capital of venezuela"], "answer": "**Caracas** is the capital of Venezuela."},
    {"keywords": ["capital of new zealand", "new zealand capital", "kiwi capital"], "answer": "**Wellington** is the capital of New Zealand (not Auckland)."},
    {"keywords": ["capital of philippines", "philippine capital", "what is the capital of the philippines"], "answer": "**Manila** is the capital of the Philippines."},
    {"keywords": ["capital of thailand", "thai capital", "what is the capital of thailand"], "answer": "**Bangkok** is the capital of Thailand."},
    {"keywords": ["capital of vietnam", "vietnamese capital", "what is the capital of vietnam"], "answer": "**Hanoi** is the capital of Vietnam."},
    {"keywords": ["capital of indonesia", "indonesian capital", "what is the capital of indonesia"], "answer": "**Jakarta** is the capital of Indonesia (Nusantara is being built as the new capital)."},
    {"keywords": ["capital of malaysia", "malaysian capital", "what is the capital of malaysia"], "answer": "**Kuala Lumpur** is the capital of Malaysia (Putrajaya is the administrative center)."},
    {"keywords": ["capital of singapore"], "answer": "**Singapore** is a city-state — the city is the country and the capital."},
    {"keywords": ["capital of pakistan", "pakistani capital", "what is the capital of pakistan"], "answer": "**Islamabad** is the capital of Pakistan."},
    {"keywords": ["capital of bangladesh", "bangladeshi capital", "what is the capital of bangladesh"], "answer": "**Dhaka** is the capital of Bangladesh."},
    {"keywords": ["capital of sri lanka", "sri lankan capital"], "answer": "**Colombo** (commercial) and **Sri Jayawardenepura Kotte** (legislative) are the capitals of Sri Lanka."},
    {"keywords": ["capital of nepal", "nepalese capital", "what is the capital of nepal"], "answer": "**Kathmandu** is the capital of Nepal."},
    {"keywords": ["capital of afghanistan", "afghan capital", "what is the capital of afghanistan"], "answer": "**Kabul** is the capital of Afghanistan."},
    {"keywords": ["capital of ukraine", "ukrainian capital", "what is the capital of ukraine"], "answer": "**Kyiv** (Kiev) is the capital of Ukraine."},
    {"keywords": ["capital of romania", "romanian capital", "what is the capital of romania"], "answer": "**Bucharest** is the capital of Romania."},
    {"keywords": ["capital of hungary", "hungarian capital", "what is the capital of hungary"], "answer": "**Budapest** is the capital of Hungary."},
    {"keywords": ["capital of czech republic", "capital of czechia", "czech capital"], "answer": "**Prague** is the capital of Czechia (Czech Republic)."},
    {"keywords": ["capital of austria", "austrian capital", "what is the capital of austria"], "answer": "**Vienna** is the capital of Austria."},
    {"keywords": ["capital of switzerland", "swiss capital", "what is the capital of switzerland"], "answer": "**Bern** is the capital of Switzerland (not Geneva or Zurich)."},
    {"keywords": ["capital of belgium", "belgian capital", "what is the capital of belgium"], "answer": "**Brussels** is the capital of Belgium."},
    {"keywords": ["capital of netherlands", "dutch capital", "what is the capital of the netherlands"], "answer": "**Amsterdam** is the capital of the Netherlands (The Hague is the seat of government)."},
    {"keywords": ["capital of ireland", "irish capital", "what is the capital of ireland"], "answer": "**Dublin** is the capital of Ireland."},
    {"keywords": ["capital of scotland"], "answer": "**Edinburgh** is the capital of Scotland."},
    {"keywords": ["capital of cuba", "cuban capital", "what is the capital of cuba"], "answer": "**Havana** is the capital of Cuba."},
    {"keywords": ["capital of jamaica", "jamaican capital", "what is the capital of jamaica"], "answer": "**Kingston** is the capital of Jamaica."},
    {"keywords": ["capital of puerto rico", "puerto rican capital"], "answer": "**San Juan** is the capital of Puerto Rico."},

    # === HISTORY ===
    {"keywords": ["who was the first president of the united states", "first us president"], "answer": "**George Washington** was the first President of the United States (1789-1797)."},
    {"keywords": ["when was the declaration of independence", "american independence date", "when did america become independent"], "answer": "**July 4, 1776** — the Continental Congress adopted the Declaration of Independence."},
    {"keywords": ["who was cleopatra", "cleopatra"], "answer": "**Cleopatra VII** was the last active ruler of the Ptolemaic Kingdom of Egypt (69-30 BC). She was known for her intelligence, political alliances with Julius Caesar and Mark Antony."},
    {"keywords": ["what was world war 2", "world war ii", "ww2"], "answer": "**World War II (1939-1945)** was the deadliest conflict in history, fought between the Allies (UK, USSR, USA, etc.) and the Axis (Germany, Japan, Italy). It ended with the defeat of Nazi Germany and Japan."},
    {"keywords": ["what was world war 1", "world war i", "ww1"], "answer": "**World War I (1914-1918)** was triggered by the assassination of Archduke Franz Ferdinand. It involved most of the world's great powers and ended with the Treaty of Versailles."},
    {"keywords": ["who was julius caesar", "julius caesar"], "answer": "**Julius Caesar (100-44 BC)** was a Roman general and statesman who became dictator of Rome. He was assassinated on the Ides of March by senators including Brutus."},
    {"keywords": ["who was abraham lincoln", "abraham lincoln"], "answer": "**Abraham Lincoln (1809-1865)** was the 16th US President. He led the country through the Civil War, abolished slavery with the Emancipation Proclamation, and was assassinated by John Wilkes Booth."},
    {"keywords": ["when was the berlin wall built", "berlin wall", "when did the berlin wall fall"], "answer": "The **Berlin Wall** was built on **August 13, 1961** by East Germany. It fell on **November 9, 1989**, symbolizing the end of the Cold War and German reunification."},
    {"keywords": ["who was mahatma gandhi", "gandhi"], "answer": "**Mahatma Gandhi (1869-1948)** was the leader of India's independence movement using nonviolent civil disobedience. He inspired civil rights movements worldwide."},
    {"keywords": ["who was nelson mandela", "nelson mandela"], "answer": "**Nelson Mandela (1918-2013)** was a South African anti-apartheid revolutionary and the first Black president of South Africa (1994-1999). He spent 27 years in prison."},
    {"keywords": ["when was the french revolution", "french revolution date"], "answer": "The **French Revolution** began on **July 14, 1789** with the storming of the Bastille. It ended the monarchy and established the French Republic."},
    {"keywords": ["who discovered america", "who found america"], "answer": "**Christopher Columbus** reached the Americas in **1492** (though he landed in the Caribbean). Norse explorer Leif Erikson reached North America around 1000 AD."},
    {"keywords": ["who was the first man on the moon", "moon landing", "first person on the moon"], "answer": "**Neil Armstrong** was the first person to walk on the Moon on **July 20, 1969** during the Apollo 11 mission. He said: 'That's one small step for man, one giant leap for mankind.'"},
    {"keywords": ["what was the renaissance", "define renaissance"], "answer": "The **Renaissance** (14th-17th century) was a cultural movement starting in Italy, marked by a revival of art, literature, science and learning. Key figures: Leonardo da Vinci, Michelangelo, Galileo."},
    {"keywords": ["what was the dark ages", "define dark ages"], "answer": "The **Dark Ages** (roughly 5th-10th century) refers to the early Middle Ages in Europe, a period of decline after the fall of the Roman Empire, marked by limited learning and cultural activity."},
    {"keywords": ["who was martin luther king", "martin luther king jr", "mlk"], "answer": "**Martin Luther King Jr. (1929-1968)** was an American civil rights leader who fought racial injustice through nonviolent protest. His 'I Have a Dream' speech is one of the most famous in history."},
    {"keywords": ["when was the magna carta signed", "magna carta"], "answer": "The **Magna Carta** was signed on **June 15, 1215** at Runnymede, England. It established that everyone, including the king, was subject to the law — a foundational document for democracy."},
    {"keywords": ["what was the cold war", "define cold war"], "answer": "The **Cold War (1947-1991)** was a geopolitical tension between the US and Soviet Union. No direct military conflict, but proxy wars, the arms race, and the space race."},
    {"keywords": ["who was the first emperor of rome", "first roman emperor"], "answer": "**Augustus Caesar** (born Octavian, 63 BC - 14 AD) was the first Roman Emperor, ruling from 27 BC to 14 AD."},
    {"keywords": ["what happened on 9/11", "september 11", "911 attacks"], "answer": "On **September 11, 2001**, terrorists hijacked four planes in the US. Two hit the World Trade Center in New York, one hit the Pentagon, one crashed in Pennsylvania. Nearly 3,000 people died."},
    {"keywords": ["when was the industrial revolution", "industrial revolution date"], "answer": "The **Industrial Revolution** began in **Britain around 1760** and spread globally. It transformed economies from agriculture to manufacturing, using steam power, factories, and machinery."},
    {"keywords": ["who was queen victoria", "queen victoria"], "answer": "**Queen Victoria (1819-1901)** was Queen of the United Kingdom for 63 years. The Victorian era was marked by industrial expansion, the British Empire's growth, and strict social norms."},
    {"keywords": ["what was the great depression", "great depression"], "answer": "The **Great Depression (1929-late 1930s)** was the worst economic downturn in modern history. It began with the US stock market crash and caused worldwide unemployment and poverty."},
    {"keywords": ["who invented the light bulb", "light bulb inventor"], "answer": "**Thomas Edison** is credited with inventing the practical incandescent light bulb in **1879**, though many inventors contributed to its development."},
    {"keywords": ["who was einstein", "albert einstein"], "answer": "**Albert Einstein (1879-1955)** was a theoretical physicist who developed the theory of relativity (E=mc^2). He won the Nobel Prize in Physics in 1921."},
    {"keywords": ["who was charlemagne", "charlemagne"], "answer": "**Charlemagne (742-814)** was King of the Franks and first Holy Roman Emperor. He united much of Western Europe and promoted education and culture."},
    {"keywords": ["when was the great wall of china built", "great wall of china"], "answer": "The **Great Wall of China** was built over many centuries, beginning around the **7th century BC**. The most well-known sections were built during the Ming Dynasty (1368-1644)."},
    {"keywords": ["what was the black death", "bubonic plague", "the plague"], "answer": "The **Black Death (1347-1351)** was a devastating plague that killed an estimated 75-200 million people in Europe. It was caused by the bacterium Yersinia pestis spread by fleas on rats."},
    {"keywords": ["who was napoleon", "napoleon bonaparte"], "answer": "**Napoleon Bonaparte (1769-1821)** was a French military leader and emperor who conquered much of Europe. He was defeated at Waterloo in 1815 and exiled to Saint Helena."},
    {"keywords": ["what was the reformation", "protestant reformation"], "answer": "The **Protestant Reformation (1517)** began when **Martin Luther** nailed his 95 Theses to a church door in Wittenberg, challenging Catholic Church practices. It led to the creation of Protestant churches."},
    {"keywords": ["who wrote the declaration of independence", "author of declaration"], "answer": "**Thomas Jefferson** was the primary author of the Declaration of Independence in 1776."},
    {"keywords": ["what was the civil war", "american civil war"], "answer": "The **American Civil War (1861-1865)** was fought between the Union (Northern states) and Confederacy (Southern states) primarily over slavery. President Lincoln led the Union to victory."},
    {"keywords": ["what was the slave trade", "transatlantic slave trade"], "answer": "The **Transatlantic Slave Trade (16th-19th century)** forcibly transported millions of Africans to the Americas. It was one of the greatest atrocities in human history and ended through abolition movements."},
    {"keywords": ["who was olaudah equiano"], "answer": "**Olaudah Equiano (1745-1797)** was a freed enslaved African whose autobiography helped the abolitionist movement in Britain. He documented the horrors of the Middle Passage."},

    # === GENERAL KNOWLEDGE / FUN ===
    {"keywords": ["what is the meaning of life", "meaning of life", "what is meaning of life"], "answer": "42. At least according to The Hitchhiker's Guide to the Galaxy."},
    {"keywords": ["tell me a joke", "joke", "say something funny", "make me laugh"], "answer": "Why do programmers prefer dark mode? Because light attracts bugs!"},
    {"keywords": ["what is 0 divided by 0", "0 divided by 0", "0/0"], "answer": "0/0 is undefined (indeterminate form). Mathematics says this operation has no meaningful result."},
    {"keywords": ["is infinity a number", "is infinity a number or concept"], "answer": "No. Infinity is a concept describing something without bound or end."},
    {"keywords": ["what language do you speak", "what languages do you know", "what language are you"], "answer": "I communicate in English, but I understand many languages."},
    {"keywords": ["are you sentient", "are you conscious", "do you have consciousness"], "answer": "No. I'm an AI that processes text and generates responses based on patterns in data."},
    {"keywords": ["do you have feelings", "can you feel", "are you emotional"], "answer": "No. I don't have feelings, consciousness, or self-awareness. I'm a language model."},
    {"keywords": ["what is ai", "define ai", "what is artificial intelligence"], "answer": "Artificial Intelligence (AI) is computer software that mimics human-like tasks such as reasoning, learning, and problem-solving."},
    {"keywords": ["what is machine learning", "define machine learning", "explain machine learning"], "answer": "Machine Learning is a subset of AI where systems learn patterns from data to improve performance without being explicitly programmed."},
    {"keywords": ["what is the internet", "how does the internet work", "define internet"], "answer": "A global network of interconnected computers that communicate using standardized protocols to share information."},
    {"keywords": ["what is cryptocurrency", "define cryptocurrency", "explain cryptocurrency"], "answer": "A digital or virtual currency that uses cryptography for security, operating on decentralized networks like blockchain."},
    {"keywords": ["what is blockchain", "define blockchain", "explain blockchain"], "answer": "A distributed, immutable digital ledger that records transactions across many computers so no single entity controls the data."},
    {"keywords": ["what is bitcoin", "define bitcoin", "explain bitcoin"], "answer": "The first and most well-known cryptocurrency, created in 2009 by the pseudonymous Satoshi Nakamoto."},
    {"keywords": ["what is climate change", "explain climate change", "define climate change"], "answer": "Long-term shifts in global temperatures and weather patterns, primarily driven by human activities like burning fossil fuels."},
    {"keywords": ["what is photosynthesis", "explain photosynthesis"], "answer": "The process by which plants convert sunlight, water, and carbon dioxide into glucose and oxygen."},
    {"keywords": ["what is dna", "define dna"], "answer": "Deoxyribonucleic acid - a molecule that carries the genetic instructions for the development and functioning of all living things."},
    {"keywords": ["what is evolution", "explain evolution", "define evolution"], "answer": "The process by which species change over generations through variations in heritable traits, natural selection, and genetic drift."},
    {"keywords": ["what is gravity", "explain gravity", "define gravity"], "answer": "A fundamental force of attraction between objects with mass. On Earth, it gives objects weight and causes them to fall when dropped."},

    # === GENERAL KNOWLEDGE ===
    {"keywords": ["largest ocean", "what is the largest ocean"], "answer": "**The Pacific Ocean** is the largest and deepest ocean, covering about 63 million square miles."},
    {"keywords": ["tallest mountain", "what is the tallest mountain"], "answer": "**Mount Everest** is the tallest mountain above sea level at **8,849 meters (29,032 feet)** in the Himalayas."},
    {"keywords": ["longest river", "what is the longest river"], "answer": "**The Nile River** (6,650 km) is traditionally considered the longest, though some measurements suggest the **Amazon River** may be longer."},
    {"keywords": ["largest country by area", "biggest country"], "answer": "**Russia** is the largest country by area at approximately 17.1 million square kilometers."},
    {"keywords": ["most populous country", "most people", "country with most population"], "answer": "**India** overtook China as the world's most populous country in 2023 with over 1.4 billion people."},
    {"keywords": ["how many continents", "name the continents"], "answer": "There are **7 continents**: Africa, Antarctica, Asia, Australia (Oceania), Europe, North America, and South America."},
    {"keywords": ["how many countries are there", "total countries in the world"], "answer": "There are approximately **195 countries** in the world (193 UN member states plus 2 non-member observers)."},
    {"keywords": ["what is the speed of light", "how fast is light"], "answer": "**The speed of light is approximately 299,792,458 meters per second** (about 186,000 miles per second) in a vacuum."},
    {"keywords": ["what is the boiling point of water", "water boiling point"], "answer": "**100 degrees Celsius (212 degrees Fahrenheit)** at sea level."},
    {"keywords": ["what is the freezing point of water", "water freezing point"], "answer": "**0 degrees Celsius (32 degrees Fahrenheit)**."},
    {"keywords": ["how many bones in the human body", "human bones"], "answer": "An adult human body has **206 bones**. Babies are born with about 270, but many fuse together as they grow."},
    {"keywords": ["what is the solar system", "our solar system"], "answer": "**Our solar system** consists of the Sun and everything orbiting it: 8 planets (Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune), dwarf planets, asteroids, and comets."},
]


def _norm(text: str) -> str:
    return text.lower().strip()


def solve_math(query: str):
    """Try to evaluate query as math. Returns 'expr = result' or None."""
    import re, math
    lower = (query or "").lower().strip()
    prefix_re = r"^(whats|what\'s|what is|what are|whats is|calculate|solve|compute|please|can you|hey|hi|the answer is|result of|answer|is|the)\s+"
    prev = None
    while prev != lower and lower:
        prev = lower
        lower = re.sub(prefix_re, "", lower, flags=re.I).strip()
    if not lower:
        return None
    s = lower.replace("\u00d7", "*").replace("\u00f7", "/").replace("\u2212", "-").replace("\u03c0", "pi")
    s = s.replace(" ", "")
    s = re.sub(r"(\d+(\.\d+)?)\s*%", r"(\1/100)", s)
    s = re.sub(r"sqrt\(([^)]+)\)", r"math.sqrt(\1)", s, flags=re.I)
    s = re.sub(r"sqrt(\d+(\.\d+)?)", r"math.sqrt(\1)", s, flags=re.I)
    s = re.sub(r"\bpi\b", str(math.pi), s, flags=re.I)
    s = s.replace("^", "**")
    s = re.sub(r"(\d)\(", r"\1*(", s)
    s = re.sub(r"\)(\d)", r")*\1", s)
    s = s.replace(")(", ")*(")
    cleaned = s.replace("math.sqrt", "").replace("math.pi", "").replace("math.pi", "")
    cleaned = re.sub(r"[0-9+\-*/%().]", "", cleaned)
    if cleaned:
        return None
    try:
        result = eval(s, {"__builtins__": {}}, {"math": math})
        if isinstance(result, (int, float)) and math.isfinite(result):
            rounded = round(result, 10)
            if isinstance(rounded, float) and rounded.is_integer():
                rounded = int(rounded)
            return f"**{lower} = {rounded}**"
    except Exception:
        return None
    return None


def match_directory(query: str):
    """Return (entry, ) if query matches a directory entry, else None.

    An entry matches if ANY of its keywords appears in the query. Among all
    matching entries, the one with the most specific (longest) matched keywords
    wins, so 'what is your name' outranks a generic 'name' keyword.
    """
    # math has priority — handles "whats 34+43" etc. without keyword tricks
    math_ans = solve_math(query)
    if math_ans:
        return {"keywords": [], "answer": math_ans}
    if not query:
        return None
    q = _norm(query)
    best = None
    for entry in DIRECTORY:
        matched = [kw for kw in entry["keywords"] if kw in q]
        if not matched:
            continue
        score = sum(len(kw) for kw in matched)
        if best is None or score > best[1]:
            best = (entry, score)
    return best[0] if best else None
