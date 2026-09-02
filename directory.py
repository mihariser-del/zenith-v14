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
    {"keywords": ["how many seconds in a year", "seconds in a year", "seconds in a day", "how many seconds in a day"], "answer": "There are **86,400 seconds in a day** and **31,536,000 seconds** (about 31.5 million) in a standard (non-leap) year."},
    {"keywords": ["how many minutes in a day", "minutes in a day", "how many days in a year", "weeks in a year"], "answer": "There are **1,440 minutes per day** (24 x 60), **365 days per year**, and **52 weeks plus 1 day** in a standard year."},
    {"keywords": ["how many hours in a week", "hours in a day", "hours in a month"], "answer": "There are **24 hours in a day**, **168 hours in a week**, and roughly **730 hours in a month.**"},
    {"keywords": ["how many legs does a spider have", "spider legs", "how many eyes does a spider have"], "answer": "Most **spiders have 8 legs** and 8 simple eyes (arranged in pairs). Insects, by contrast, have 6 legs."},
    {"keywords": ["how many teeth does an adult human have", "how many teeth do adults have", "human teeth count"], "answer": "An adult human normally has **32 teeth** (including 4 wisdom teeth), while children have 20 baby teeth."},
    {"keywords": ["how many hearts does an octopus have", "octopus hearts", "how many hearts does a worm have"], "answer": "An **octopus has 3 hearts** — two pump blood to the gills, one pumps it to the rest of the body."},
    {"keywords": ["how many bones are in a baby", "baby bones", "how many bones at birth"], "answer": "A **newborn baby has about 270 bones**. Many fuse together as they grow, leaving adults with 206."},
    {"keywords": ["how old is the sun", "sun age", "age of the sun"], "answer": "The **Sun is about 4.6 billion years old** and is roughly halfway through its life — it should burn for another 5 billion years or so."},
    {"keywords": ["how big is the earth", "earth diameter", "size of the earth"], "answer": "Earth's **diameter is about 12,742 km** (7,918 miles) and its circumference is about **40,075 km** around the equator."},
    {"keywords": ["how far is the moon from earth", "distance to the moon", "moon distance"], "answer": "The **Moon averages about 384,400 km** (238,855 miles) from Earth. It has a diameter of about 3,474 km."},
    {"keywords": ["how far is the sun from earth", "distance to the sun"], "answer": "The **Sun averages about 149.6 million km** (93 million miles) from Earth — known as 1 Astronomical Unit (AU)."},
    {"keywords": ["how many stars in the sky", "how many stars in the universe", "what is a galaxy"], "answer": "There are an estimated **100–400 billion stars in our Milky Way** and possibly **over 100 billion galaxies** in the observable universe — the total count is astronomically huge."},
    {"keywords": ["who is the richest person", "richest man in the world", "richest person"], "answer": "The world's richest people shift often with markets. I'd recommend checking a live web search for the current #1 — I can do that when you're online if you enable the web button."},
    {"keywords": ["what is the tallest building", "tallest building in the world", "world's tallest skyscraper"], "answer": "**Burj Khalifa** in Dubai is the tallest building at **828 m (2,717 ft)** with over 160 floors."},
    {"keywords": ["which country has the most people", "largest population country", "most populous country in the world"], "answer": "**India** is currently the world's most populous country with over **1.4 billion people**, closely followed by China."},
    {"keywords": ["what is the currency of nigeria", "nigerian currency", "naira"], "answer": "The currency of Nigeria is the **Naira (NGN)**, issued by the Central Bank of Nigeria."},
    {"keywords": ["what is the capital of lagos state", "where is lagos"], "answer": "Lagos is a state (and city) in Nigeria, and its capital is **Ikeja**. Lagos is Nigeria's commercial hub but not the national capital."},
    {"keywords": ["who is the president of nigeria", "president of nigeria", "nigerian president"], "answer": "As of my current data, **Bola Ahmed Tinubu** is the President of Nigeria (inaugurated May 2023). Elections can change this, so verify with a live web search when online."},
    {"keywords": ["what is the largest country in africa", "biggest country in africa", "largest african country"], "answer": "**Algeria** is the largest country in Africa by area (about 2.38 million sq km). Nigeria is the most populous."},
    {"keywords": ["who won the last world cup", "last world cup winner", "fifa world cup history"], "answer": "The most recent FIFA Men's World Cup (2022) was won by **Argentina**, beating France in the final."},
    {"keywords": ["how tall is mount everest", "mount everest height"], "answer": "**Mount Everest** stands at **8,849 meters (29,032 feet)** above sea level, the highest point on Earth."},
    {"keywords": ["what is the largest planet", "biggest planet in the solar system"], "answer": "**Jupiter** is the largest planet in our solar system — about **11 times** Earth's diameter and more massive than all other planets combined."},
    {"keywords": ["why is the sky blue", "why is the sky not blue", "sky colour reason"], "answer": "The sky appears blue because **air molecules scatter sunlight** more at short (blue) wavelengths — known as Rayleigh scattering. At sunset, the longer path makes it look red/orange."},
    {"keywords": ["why is water wet", "is water wet"], "answer": "Water isn't literally 'wet' — **wetness is what a liquid does to something else** when you touch it. Water molecules strongly attract each other (cohesion), which is why it clings and feels wet."},
    {"keywords": ["what is the smallest country in the world", "smallest country"], "answer": "**Vatican City** is the world's smallest country at just **0.49 sq km** (about 121 acres)."},
    {"keywords": ["what is the biggest animal in the world", "largest animal", "biggest animal"], "answer": "The **blue whale** is the largest animal ever known to have lived — up to **30 meters (98 ft)** long and over 170 tonnes."},
    {"keywords": ["how fast can a cheetah run", "fastest animal on land", "cheetah speed"], "answer": "The **cheetah** is the fastest land animal, reaching **about 100–110 km/h (62–70 mph)** in short bursts covering up to 150m."},
    {"keywords": ["what is the fastest bird", "fastest animal in the sky", "fastest bird"], "answer": "The **peregrine falcon** is the fastest animal in a dive, exceeding **300 km/h (186 mph)**."},
    {"keywords": ["how long does it take sunlight to reach earth", "sunlight to earth time"], "answer": "Sunlight takes about **8 minutes and 20 seconds** to travel from the Sun to Earth."},
    {"keywords": ["how deep is the ocean", "depth of the ocean", "deepest point in the ocean"], "answer": "The average ocean depth is about **3,688 m**; the deepest point is the **Mariana Trench**, about **11,000 m (about 7 miles)** deep."},
    {"keywords": ["what is the rarest blood type", "blood types", "rh null"], "answer": "The rarest is **Rh-null** ('golden blood'), found in fewer than 50 people worldwide. Among common types, **AB negative** is the rarest."},
    {"keywords": ["how many senses do humans have", "five senses", "human senses"], "answer": "Classically there are **5 senses** (sight, hearing, taste, smell, touch), but scientists count **more than 20** including balance, temperature, pain, and body position (proprioception)."},
    {"keywords": ["why do we dream", "what causes dreams", "why do we sleep"], "answer": "Dreams happen mainly during **REM sleep**. Exact reasons aren't fully known, but leading theories link them to memory consolidation, emotional processing, and randomly fired brain signals."},
    {"keywords": ["can you tell me a fact", "give me a fun fact", "fun fact", "interesting fact"], "answer": "Here's a fun one: **honey never spoils** — archaeologists have found 3,000-year-old honey in ancient Egyptian tombs that was still edible."},
    {"keywords": ["what is the most spoken language", "most spoken language in the world", "most languages"], "answer": "By native speakers, **Mandarin Chinese** leads (~900M). If counting all speakers, **English** has the most total speakers worldwide (~1.5B)."},
    {"keywords": ["how do planes fly", "why do planes fly", "how airplanes fly"], "answer": "Planes fly because **air moving faster over a wing lowers pressure above it** (Bernoulli's principle), creating lift. Thrust pushes forward, drag resists, and gravity pulls down — the four forces of flight."},
    {"keywords": ["why does the sun rise in the east", "sunrise direction", "why does the sun set in the west"], "answer": "The Sun appears to rise **east** and set **west** because **Earth rotates eastward** on its axis. It isn't moving — we are."},
    {"keywords": ["what is the difference between weather and climate", "weather vs climate"], "answer": "**Weather** is the short-term state of the atmosphere (today, this week). **Climate** is the long-term average of weather over decades — 'climate is what you expect, weather is what you get.'"},
    {"keywords": ["how many planets are there", "number of planets", "are there 8 planets"], "answer": "There are **8 planets** in our solar system (Pluto was reclassified as a dwarf planet in 2006). In recent years some astronomers also study the hypothetical 'Planet Nine'."},
    {"keywords": ["what is the largest desert", "biggest desert", "largest hot desert"], "answer": "The largest desert is **Antarctica** (a polar desert). The largest **hot** desert is the **Sahara**, about 9.2 million sq km."},
    {"keywords": ["what is the longest word in the english language", "longest english word"], "answer": "The longest word with letters isn't fully settled, but **pneumonoultramicroscopicsilicovolcanoconiosis** (45 letters, a lung disease) is often cited. More practical longest is **antidisestablishmentarianism**."},
    {"keywords": ["how many states are in the usa", "states in america", "how many states in the us"], "answer": "There are **50 states** in the United States, plus the federal district Washington D.C. and several territories."},
    {"keywords": ["what is the national animal of nigeria", "national animal nigeria", "nigeria symbol"], "answer": "Nigeria's national animal is the **eagle**, and its national bird is the **black-crowned crane**."},
    {"keywords": ["what is the nigerian flag", "nigerian flag meaning"], "answer": "Nigeria's flag has three vertical bands — **green, white, green**. Green represents agriculture and natural wealth; white stands for peace and unity."},
    {"keywords": ["what time is it in lagos", "lagos time", "nigeria time zone", "what is the time zone of nigeria"], "answer": "Nigeria runs on **West Africa Time (WAT, UTC+1)**, with no daylight saving. You can see your device's clock for the current local time."},
    {"keywords": ["tell me about nigeria", "about nigeria", "facts about nigeria"], "answer": "**Nigeria** is Africa's most populous country (~230M) and largest economy. Its capital is Abuja, commercial hub is Lagos, and it has over **250 ethnic groups** and **500+ languages**."},
    {"keywords": ["what is jamb", "jamb exam", "jamb utme", "what does jamb stand for"], "answer": "**JAMB** is the Joint Admissions and Matriculation Board of Nigeria, which runs the UTME exam used for entry into Nigerian universities, polytechnics, and colleges."},
    {"keywords": ["what is waec", "waec exam", "what does waec stand for"], "answer": "**WAEC** is the West African Examinations Council, which administers the WASSCE — the senior secondary certificate exam across Nigeria, Ghana, and other West African countries."},
    {"keywords": ["how do i score high in jamb", "jamb tips", "how to pass jamb"], "answer": "For JAMB: practice past questions, focus on your best four subjects, manage time (2 hours), watch your speed on the CBT interface, and memorize formulas. Consistency beats cramming."},
    {"keywords": ["what is a website", "how do websites work", "what is html"], "answer": "A **website** is a collection of pages served over the internet. **HTML** defines content/structure, **CSS** styling, and **JavaScript** interactivity. Browsers read these files to display them."},
    {"keywords": ["how do i start coding", "how to learn programming", "learn to code"], "answer": "Pick one language (like **Python** or **JavaScript**), learn basics (variables, loops, functions), build tiny projects, and practice daily. The docs and free courses online are your best friends."},
    {"keywords": ["what is python", "is python good", "learn python"], "answer": "**Python** is a beginner-friendly, high-level programming language used for web apps, data science, AI, and automation. It's known for its clear and readable syntax."},
    {"keywords": ["what is javascript", "js language"], "answer": "**JavaScript** is the language of the web — it runs in browsers to make pages interactive, and with Node.js it can also run on servers. It's one of the most-used languages in the world."},
    {"keywords": ["how to send you an image", "can you see my image", "image"], "answer": "Yes! You can attach images to your chat and I'll read/describe them. If you're offline, upload still works and I'll answer about the file the moment I can process it."},
    {"keywords": ["do you remember our chat", "do you remember me", "do you have memory"], "answer": "Yes, Zenith has **memory** across sessions (when enabled). Each chat conversation is stored, so I can pick up where we left off."},
    {"keywords": ["are you safe to use", "is zenith safe", "can you hack"], "answer": "Zenith is designed to be **safe and privacy-conscious**. I can't hack devices or access things you haven't shared with me. Use common sense and never share sensitive passwords with any AI."},
    {"keywords": ["what can i ask you", "what should i ask", "give me example questions"], "answer": "You can ask me almost anything — homework & math, writing, code, definitions, general knowledge, jokes, or defaults like capitals and science facts. Try: 'what is 25*4', 'capital of Ghana', or 'tell me a joke'."},
    {"keywords": ["help me", "i need help", "can you help me"], "answer": "Of course! Tell me what you need help with — a homework question, math, writing, code, or general knowledge — and I'll do my best to help right away."},
    {"keywords": ["what do you mean", "explain that", "i don't understand"], "answer": "I can explain things in **simpler terms**. Just tell me which part confused you, and I'll rephrase it with an example so it's clearer."},
    {"keywords": ["give me some motivation", "motivate me", "inspire me", "motivational quote"], "answer": "Here's one: **'It always seems impossible until it's done.' — Nelson Mandela.** Small, consistent steps beat big occasional bursts. You've got this!"},
    {"keywords": ["make me happy", "cheer me up", "make me feel better"], "answer": "Smile tip: whenever you feel down, list three small things you're grateful for. Oh — and here's a fact: **octopuses have three hearts**, so technically they have three times the love. 😄"},
    {"keywords": ["good morning message", "morning greeting", "good morning boss"], "answer": "Good morning! ☀️ May today be productive and kind to you. What shall we tackle first?"},
    {"keywords": ["who is the current president of the united states", "president of usa 2026", "us president now"], "answer": "Presidents change by election, so the exact current one can change. I'd recommend a **web search** for the latest — I can do that when you're online. As of my data, recent holders include Trump and Biden."},
    {"keywords": ["what is the population of the world", "world population 2026", "how many people in the world"], "answer": "The world population is about **8 billion** people (crossing 8B in 2022) and is still slowly growing — roughly 8.1–8.2 billion as of 2026."},
    {"keywords": ["how long can a human live", "maximum human lifespan", "oldest person ever"], "answer": "The oldest verified person lived to **122 years** (Jeanne Calment). Average life expectancy worldwide is about **73 years**, higher in developed countries."},
    {"keywords": ["why do we have seasons", "why do seasons change"], "answer": "We have seasons because **Earth's axis is tilted ~23.5°** as it orbits the Sun. That tilt makes sunlight hit each hemisphere at different angles through the year, giving summer/winter and spring/autumn."},
    {"keywords": ["how does a rainbow form", "why do rainbows appear", "what makes a rainbow"], "answer": "Rainbows form when **sunlight enters raindrops, refracts, and reflects**, splitting white light into its colors (red to violet). You see it when sun is behind you and rain ahead."},
    {"keywords": ["what is the human body made of", "what are we made of", "elements in the body"], "answer": "By mass you're mostly **oxygen (65%), carbon (18%), hydrogen (10%), and calcium (1.5%)** — plus smaller amounts of phosphorus, potassium, sulfur, and others. Nearly all your atoms came from stars."},
    {"keywords": ["how does wifi work", "what is wifi", "how does the internet connect"], "answer": "**Wi-Fi** sends data as radio waves between a router and your device, using channels to avoid interference. The router then connects to the wider internet via cables/fiber."},
    {"keywords": ["what is an email", "how do i write an email", "email etiquette"], "answer": "An **email** is a digital message sent over networks. Keep it clear: a friendly greeting, a short body explaining the point, a call to action, and a respectful sign-off."},
    {"keywords": ["what is a virus on a computer", "computer virus", "malware"], "answer": "A **computer virus** is a type of malware that spreads and damages systems. Stay safe by only installing trusted software, keeping updates on, and being careful with attachments."},
    {"keywords": ["who is my dad", "who is my father", "do you know my family"], "answer": "I don't have personal knowledge of you, so I can't know who your dad is — but if you tell me, I'll remember it in our conversation. 😊"},
    {"keywords": ["do you know my name", "what is my name", "who am i"], "answer": "I can see your account username, but otherwise I don't hold private info about you. You can tell me your name and I'll remember it for this chat!"},
    {"keywords": ["how to make money", "how to earn money", "ways to make money"], "answer": "Common paths: a **job/trade, freelancing, a side business, or investing** (carefully). I can help brainstorm ideas that match your skills if you tell me what you're good at."},
    {"keywords": ["what should i eat today", "whats for lunch", "suggest me food"], "answer": "Balance it out: a **protein (chicken/beans/eggs) + a complex carb (rice/plantain) + vegetables + fruit**. Add water, and you've got a solid plate. Craving something, what's on your mind?"},
    {"keywords": ["how do i sleep better", "how to sleep fast", "better sleep tips"], "answer": "Stick to a fixed schedule, keep your room dark and cool, avoid screens 30–60 min before bed, cut caffeine in the evening, and try relaxing your muscles. Aim for **7–9 hours**."},
    {"keywords": ["exercise for beginners", "how do i start exercising", "home workout"], "answer": "Start slow: **20–30 min, 3–4 days a week** — brisk walking, bodyweight squats, push-ups, or stretching. Warm up first, rest between days, and increase gradually."},
    {"keywords": ["what should i drink for health", "healthy drinks", "benefits of water"], "answer": "**Water** is the healthiest drink — aim for about **2 liters (8 glasses) a day**. Limit sugary drinks and excess caffeine. Herbal tea counts toward your fluids too."},
    {"keywords": ["spell beautiful", "how do you spell beautiful", "spell the word"], "answer": "**B-E-A-U-T-I-F-U-L**. If you meant a different word, just tell me and I'll spell it out!"},
    {"keywords": ["text me under a minute", "short reply", "reply fast"], "answer": "Consider it done — instant reply right here, no wait needed. ⚡"},
    {"keywords": ["who is the cat", "why is that the name", "what does zenith mean"], "answer": "**Zenith** means the highest or most successful point — the point in the sky directly above you. Fitting name for an AI that aims to be right on top of your questions!"},
    {"keywords": ["what is chatgpt", "are you chatgpt", "who made chatgpt"], "answer": "**ChatGPT** is an AI chatbot made by OpenAI. I'm **Zenith**, a different AI created by Wanzu Ibrahim — not ChatGPT."},
    {"keywords": ["who is elon musk", "elon musk"], "answer": "**Elon Musk** is a billionaire entrepreneur known for founding SpaceX, co-founding Tesla, and acquiring Twitter (now X). He's one of the world's richest people."},
    {"keywords": ["who is mark zuckerberg", "zuckerberg"], "answer": "**Mark Zuckerberg** is the co-founder and CEO of Meta (formerly Facebook). He launched Facebook in 2004 from Harvard and built it into a global social media giant."},
    {"keywords": ["what is nollywood", "nigerian movies", "nollywood meaning"], "answer": "**Nollywood** is Nigeria's film industry — the second largest by volume in the world (after Bollywood). It produces thousands of movies annually, mainly in English, Yoruba, Hausa, and Igbo."},
    {"keywords": ["who is wizkid", "wizkid real name", "starboy"], "answer": "**Wizkid** (Ayodeji Ibrahim Balogun) is a Nigerian Afrobeats superstar known for global hits like 'Essence' (feat. Tems) and his Grammy-winning collaborations."},
    {"keywords": ["who is burna boy", "burna boy real name"], "answer": "**Burna Boy** (Damini Ebunoluwa Ogulu) is a Nigerian Afrobeats star and Grammy Award winner."},
    {"keywords": ["who is davido", "davido real name"], "answer": "**Davido** (David Adedeji Adeleke) is a Nigerian Afrobeats singer, songwriter and record producer — one of Africa's biggest music stars."},
    {"keywords": ["how to learn python fast", "python for beginners", "python tips"], "answer": "Start with **variables, loops, functions, and lists** (the basics). Practice daily with small projects. Try free resources like Python.org docs, Codecademy, or freeCodeCamp."},
    {"keywords": ["what is css", "css meaning", "what does css do"], "answer": "**CSS (Cascading Style Sheets)** is the language used to style HTML elements — controlling colors, layout, fonts, spacing, and responsive design on web pages."},
    {"keywords": ["what is html", "html meaning", "what does html do"], "answer": "**HTML (HyperText Markup Language)** is the standard language for creating web pages. It defines the structure and content of a page using tags."},
    {"keywords": ["what is api", "api meaning", "how does api work"], "answer": "**API (Application Programming Interface)** is a way for different software systems to communicate. It defines the rules and endpoints for requesting and exchanging data between apps."},
    {"keywords": ["what is database", "types of database", "sql meaning"], "answer": "**Database** is an organized collection of data stored electronically. Common types: **SQL** (MySQL, PostgreSQL — structured tables) and **NoSQL** (MongoDB — flexible documents)."},
    {"keywords": ["how to type fast", "typing speed", "touch typing"], "answer": "Touch typing (home row keys: ASDF JKL;) is the fastest method. Practice daily on sites like typingclub.com or keybr.com. Aim for 40+ WPM initially."},
    {"keywords": ["how to make a website", "build a website", "website development steps"], "answer": "Steps: 1) Learn **HTML/CSS/JS** basics, 2) Choose a domain/hosting, 3) Design your layout, 4) Build pages, 5) Deploy (Netlify, Vercel, or GitHub Pages are free)."},
    {"keywords": ["what is github", "github meaning", "git explained"], "answer": "**GitHub** is a platform for hosting and collaborating on code using **Git** (version control). It tracks changes, enables branching/merging, and supports open-source collaboration."},
    {"keywords": ["what is a server", "how do servers work", "server explained"], "answer": "**Server** is a computer that stores, processes, and serves data to other computers (clients) over a network. When you visit a website, your browser requests data from a server."},
    {"keywords": ["how old is the earth", "earth age", "age of our planet"], "answer": "**Earth is about 4.54 billion years old**, based on radiometric dating of meteorite material and the oldest known rocks."},
    {"keywords": ["how many oceans are there", "name the oceans", "seven oceans"], "answer": "There are **5 oceans**: Pacific (largest), Atlantic, Indian, Southern (Antarctic), and Arctic (smallest)."},
    {"keywords": ["what is electricity", "how does electricity work", "electricity explained"], "answer": "**Electricity** is the flow of electric charge (electrons) through a conductor. It powers devices by providing energy through circuits — measured in volts (V), amps (A), and watts (W)."},
    {"keywords": ["how does combustion work", "what is combustion", "fire triangle"], "answer": "**Combustion** is a chemical reaction where a fuel reacts with oxygen, releasing heat and light. The fire triangle requires: **fuel + oxygen + heat**."},
    {"keywords": ["who invented the internet", "when was the internet created", "history of the internet"], "answer": "**ARPANET** (1969, funded by the US DoD) was the internet's predecessor. **Tim Berners-Lee** invented the World Wide Web in 1989."},
    {"keywords": ["what is satellite", "how do satellites work", "what does a satellite do"], "answer": "**Satellite** is an object placed in orbit around Earth. They're used for communication, weather monitoring, GPS, and scientific research."},
    {"keywords": ["is the earth round", "is earth flat", "shape of the earth"], "answer": "The Earth is an **oblate spheroid** — nearly round but slightly flattened at the poles and bulging at the equator."},
    {"keywords": ["what is the solar system", "our solar system"], "answer": "**Our solar system** consists of the Sun and everything orbiting it: 8 planets (Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune), dwarf planets, asteroids, and comets."},
]


def _norm(text: str) -> str:
    return text.lower().strip()


def solve_math(query: str):
    """Try to evaluate query as math. Returns 'expr = result' or None."""
    import re, math as _m
    raw = (query or "").lower().strip()
    if not raw:
        return None
    prefix_re = r"^(whats|what's|what is|what are|whats is|calculate|solve|compute|please|can you|hey|hi|the answer is|result of|answer|is|the)\s+"
    s = raw
    prev = None
    while prev != s and s:
        prev = s
        s = re.sub(prefix_re, "", s, flags=re.I).strip()
    if not s:
        return None
    s = s.replace("\u00d7", "*").replace("\u00f7", "/").replace("\u2212", "-")
    s = s.replace(" ", "")
    s = re.sub(r"(\d+(\.\d+)?)%", r"(\1/100)", s)
    s = re.sub(r"sqrt\(([^)]+)\)", r"SQRT(\1)", s, flags=re.I)
    s = re.sub(r"sqrt(\d+(\.\d+)?)", r"SQRT(\1)", s, flags=re.I)
    pi_val = str(_m.pi)
    s = re.sub(r"\bpi\b", f"({pi_val})", s, flags=re.I)
    s = re.sub(r"(\d)(\()", r"\1*\2", s)
    s = re.sub(r"(\))(\d)", r"\1*\2", s)
    s = re.sub(r"(\))(\()", r"\1*\2", s)
    # Power: 2^3 -> pow(2,3)
    s = re.sub(r"(\d+(\.\d+)?)\^(\d+(\.\d+)?)", r"POW(\1,\3)", s)

    tokens = []
    i = 0
    while i < len(s):
        c = s[i]
        if c.isdigit() or c == '.':
            num = ''
            while i < len(s) and (s[i].isdigit() or s[i] == '.'):
                num += s[i]; i += 1
            tokens.append(('num', float(num)))
        elif c in '+-*/':
            if c == '-' and (not tokens or tokens[-1][0] == 'op'):
                tokens.append(('num', 0.0))
            tokens.append(('op', c)); i += 1
        elif c == '(':
            tokens.append(('lparen',)); i += 1
        elif c == ')':
            tokens.append(('rparen',)); i += 1
        elif s[i:i+4].upper() == 'SQRT' and i+4 < len(s) and s[i+4] == '(':
            depth = 0; start = i + 5; j = start
            while j < len(s):
                if s[j] == '(': depth += 1
                elif s[j] == ')':
                    if depth == 0: break
                    depth -= 1
                j += 1
            inner = s[start:j]
            val = _eval_inner(inner, _m)
            if val is None or val < 0: return None
            tokens.append(('num', _m.sqrt(val)))
            i = j + 1
        elif s[i:i+3].upper() == 'POW' and i+3 < len(s) and s[i+3] == '(':
            depth = 0; start = i + 4; j = start
            while j < len(s):
                if s[j] == '(': depth += 1
                elif s[j] == ')':
                    if depth == 0: break
                    depth -= 1
                j += 1
            args_str = s[start:j]
            parts = _split_top(args_str, ',')
            if len(parts) != 2: return None
            base = _eval_inner(parts[0], _m)
            exp = _eval_inner(parts[1], _m)
            if base is None or exp is None: return None
            tokens.append(('num', _m.pow(base, exp)))
            i = j + 1
        else:
            return None
    if not tokens:
        return None

    pos = [0]
    def parse_expr():
        return parse_addsub()
    def parse_addsub():
        left = parse_muldiv()
        while pos[0] < len(tokens) and tokens[pos[0]][0] == 'op' and tokens[pos[0]][1] in '+-':
            op = tokens[pos[0]][1]; pos[0] += 1
            right = parse_muldiv()
            left = left + right if op == '+' else left - right
        return left
    def parse_muldiv():
        left = parse_unary()
        while pos[0] < len(tokens) and tokens[pos[0]][0] == 'op' and tokens[pos[0]][1] in '*/':
            op = tokens[pos[0]][1]; pos[0] += 1
            right = parse_unary()
            left = left * right if op == '*' else left / right
        return left
    def parse_unary():
        if pos[0] < len(tokens) and tokens[pos[0]][0] == 'op' and tokens[pos[0]][1] == '-':
            pos[0] += 1
            return -parse_atom()
        return parse_atom()
    def parse_atom():
        if pos[0] >= len(tokens): return 0.0
        t = tokens[pos[0]]
        if t[0] == 'num':
            pos[0] += 1; return t[1]
        if t[0] == 'lparen':
            pos[0] += 1; val = parse_expr()
            if pos[0] < len(tokens) and tokens[pos[0]][0] == 'rparen': pos[0] += 1
            return val
        return 0.0

    try:
        result = parse_expr()
        if isinstance(result, (int, float)) and _m.isfinite(result):
            rounded = round(result, 10)
            if isinstance(rounded, float) and rounded.is_integer():
                rounded = int(rounded)
            return f"**{raw} = {rounded}**"
    except Exception:
        return None
    return None


def _eval_inner(expr_str, _m):
    """Evaluate a standalone sub-expression string (for SQRT/POW args)."""
    import re as _re
    toks = []
    j = 0
    while j < len(expr_str):
        ch = expr_str[j]
        if ch.isdigit() or ch == '.':
            n = ''
            while j < len(expr_str) and (expr_str[j].isdigit() or expr_str[j] == '.'):
                n += expr_str[j]; j += 1
            toks.append(('num', float(n)))
        elif ch in '+-*/':
            if ch == '-' and (not toks or toks[-1][0] == 'op'):
                toks.append(('num', 0.0))
            toks.append(('op', ch)); j += 1
        elif ch == '(': toks.append(('lparen',)); j += 1
        elif ch == ')': toks.append(('rparen',)); j += 1
        else: return None
    if not toks: return None
    pos = [0]
    def pe():
        return pa()
    def pa():
        l = pm()
        while pos[0] < len(toks) and toks[pos[0]][0] == 'op' and toks[pos[0]][1] in '+-':
            op = toks[pos[0]][1]; pos[0] += 1; r = pm()
            l = l + r if op == '+' else l - r
        return l
    def pm():
        l = pu()
        while pos[0] < len(toks) and toks[pos[0]][0] == 'op' and toks[pos[0]][1] in '*/':
            op = toks[pos[0]][1]; pos[0] += 1; r = pu()
            l = l * r if op == '*' else l / r
        return l
    def pu():
        if pos[0] < len(toks) and toks[pos[0]][0] == 'op' and toks[pos[0]][1] == '-':
            pos[0] += 1; return -paa()
        return paa()
    def paa():
        if pos[0] >= len(toks): return 0.0
        t = toks[pos[0]]
        if t[0] == 'num': pos[0] += 1; return t[1]
        if t[0] == 'lparen':
            pos[0] += 1; v = pe()
            if pos[0] < len(toks) and toks[pos[0]][0] == 'rparen': pos[0] += 1
            return v
        return 0.0
    try:
        return pe()
    except:
        return None


def _split_top(s, sep):
    """Split string by sep only at top level (not inside parens)."""
    parts, depth, cur = [], 0, ''
    for ch in s:
        if ch == '(': depth += 1
        elif ch == ')': depth -= 1
        elif ch == sep and depth == 0:
            parts.append(cur); cur = ''; continue
        cur += ch
    if cur: parts.append(cur)
    return parts


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
