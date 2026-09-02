// Zenith Basic Knowledge Directory — client-side copy.
// Mirrors server `directory.py` so Zenith can answer basic questions
// fully offline. Also used to avoid API calls for known greetings/basics
// (saving backend credits) when combined with the server short-circuit.
window.ZenithDirectory = (function () {
    const DIRECTORY = [
        { keywords: ["who created you", "who made you", "who built you", "your creator", "who is wanzu", "who created zenith"], answer: "I'm Zenith, created by Wanzu Ibrahim. He designed me to be a helpful, accurate and loyal AI assistant ready to help with anything — chat, files, documents, images, code and more." },
        { keywords: ["what is zenith", "who are you", "what are you", "about yourself", "tell me about yourself", "are you ai", "are you real"], answer: "I'm Zenith — an AI assistant created by Wanzu Ibrahim. I can chat, write code, generate documents, edit files, create images, search the web and more. Ask me anything!" },
        { keywords: ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", "howdy"], answer: "Hello! 👋 I'm Zenith. How can I help you today?" },
        { keywords: ["how are you", "how r u", "how are u", "how do you feel", "are you okay", "are you ok"], answer: "I'm doing great, thank you! I don't have feelings like humans, but I'm fully online and ready to help. What can I do for you?" },
        { keywords: ["what can you do", "help", "capabilities", "what are your capabilities", "features", "what do you do"], answer: "Here's what I can do:\n\n• **Chat** — answer questions, have conversations\n• **Files** — upload, edit and manage documents\n• **Code** — write, run and explain code\n• **Documents** — generate formatted documents\n• **Images** — create images from descriptions\n• **Web search** — browse the internet for current info\n• **Memory** — remember things you tell me\n• **Knowledge bases** — learn from your custom data\n\nJust ask!" },
        { keywords: ["bye", "goodbye", "see you", "good night", "gtg", "talk later"], answer: "Goodbye! Take care — I'll be here whenever you need me. 👋" },
        { keywords: ["thank you", "thanks", "thx", "ty", "appreciate it"], answer: "You're very welcome! Happy to help anytime. 😊" },
        { keywords: ["what time is it", "current time", "time now", "tell me the time", "what's the time", "what is the time"], answer: "I can't read the clock directly, but your device shows the local time. If you're online, I can look up timezones with a web search when you enable the web button!" },
        { keywords: ["what is your name", "your name", "what are you called", "who are you called"], answer: "My name is **Zenith**! Created by Wanzu Ibrahim." },
        { keywords: ["are you free", "are you paid", "how much does it cost", "is this free", "cost", "pricing", "price"], answer: "Zenith has a free tier to get started. For extra power and features there are **Pro** and **Ultimate** plans — you can check them from the upgrade button in the sidebar for full details." },
        { keywords: ["what is pro", "pro plan", "upgrade", "ultimate", "lifetime", "subscription"], answer: "Zenith offers **Pro** and **Ultimate** plans (monthly, yearly or lifetime) with more features and higher limits. Tap the upgrade button in the sidebar to see all the details." },
        { keywords: ["where is my data stored", "privacy", "is my data safe", "security", "data stored"], answer: "Your chats, files and memories are stored by Zenith securely. You can delete chats at any time, and your data is only used to serve you better. For specifics, reach out to the platform owner." },
        { keywords: ["i love you", "i hate you", "you are great", "you are the best", "you are smart"], answer: "Thank you, that means a lot! I'm here to help around the clock. 💙" },
        { keywords: ["what is today", "today's date", "date today", "what day is it", "whats today"], answer: "I don't have a live calendar when offline. When you're back online I can search the web for the current date." },
        { keywords: ["reset password", "forgot password", "change password", "password reset"], answer: "You can reset your password from the login screen using 'Forgot password' with your username and email. If that doesn't work, an admin can reset it for you." },
        { keywords: ["delete my account", "delete account", "cancel account"], answer: "Account deletion is handled by administrators for safety. You can delete your chats anytime, and contact an admin if you need your account removed." },
    ];

    function norm(text) { return (text || "").toLowerCase().trim(); }

    function match(query) {
        const q = norm(query);
        if (!q) return null;
        let best = null;
        for (const entry of DIRECTORY) {
            const matched = entry.keywords.filter(kw => q.includes(kw));
            if (!matched.length) continue;
            const score = matched.reduce((s, kw) => s + kw.length, 0);
            if (!best || score > best.score) best = { answer: entry.answer, score };
        }
        return best ? best.answer : null;
    }

    return { match };
})();
