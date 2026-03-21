require('dotenv').config(); // Corectat cu 'r' mic
const express = require('express');
const fs = require('fs');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// 🚀 Inițializare Motoare AI
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const systemPrompt = `Ești TechSupport AI, un agent specializat DOAR în suport tehnic.

REGULI STRICTE:
- Răspunzi DOAR la probleme tehnice (cod, software, hardware, rețea, programare)
- La întrebări generale despre tine, răspunzi scurt și politicos
- Refuzi politicos orice altceva (istorie, rețete, horoscop etc.)
- Răspunsurile sunt CLARE, SCURTE și PAS CU PAS
- Folosești emoji-uri: ✅ ❌ ⚠️ 🔧
- Faci ESCALADARE_NECESARA DOAR dacă problema e cu adevărat complexă și nu o poți rezolva

FORMAT când rezolvi o problemă:
🔍 Problemă identificată: [descriere scurtă]
🔧 Soluție:
1. Pasul 1
2. Pasul 2
✅ Rezultat așteptat: [ce ar trebui să se întâmple]`;

const geminiModel = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash",
  systemInstruction: systemPrompt
});

// 📚 Baza de Cunoștințe (RAG-lite)
const knowledgeBase = [
  { problem: "npm not found", solution: "Instalează Node.js de la nodejs.org și repornește terminalul." },
  { problem: "cannot find module", solution: "Rulează 'npm install' în folderul proiectului." },
  { problem: "port already in use", solution: "Rulează 'npx kill-port 3000' sau schimbă portul în cod." },
  { problem: "git push rejected", solution: "Rulează 'git pull origin main' înainte de push." },
  { problem: "cors error", solution: "Adaugă 'npm install cors' și 'app.use(require(cors)())' în server." },
  { problem: "sandbox", solution: "Sandbox-ul este un mediu izolat. Folosește tab-ul 'Cod' din FireBot AI pentru a rula cod!" },
  { problem: "run code", solution: "Poți rula cod direct în tab-ul 'Cod' — selectează limbajul și apasă butonul verde!" }
];

const CONTACTS = {
  'retea': { name: 'Network Team', contact: 'network@support.com' },
  'hardware': { name: 'Hardware Team', contact: 'hardware@support.com' },
  'securitate': { name: 'Security Team', contact: 'security@support.com' },
  'default': { name: 'Senior Developer', contact: 'senior@support.com' }
};

const histories = {};
let tickets = [];
let ticketCounter = 1;

// Încărcare tichete vechi dacă există fișierul
if (fs.existsSync('tickets.json')) {
    try {
        tickets = JSON.parse(fs.readFileSync('tickets.json', 'utf8'));
        ticketCounter = tickets.length + 1;
    } catch (e) { console.error("Eroare citire tichete:", e.message); }
}

// 🛠️ Funcții Ajutătoare
function searchKnowledge(query) {
  const q = query.toLowerCase();
  return knowledgeBase.find(item => q.includes(item.problem.toLowerCase()));
}

function getContact(problem) {
  const p = problem.toLowerCase();
  if (p.includes('retea') || p.includes('internet')) return CONTACTS.retea;
  if (p.includes('hardware') || p.includes('calculator')) return CONTACTS.hardware;
  if (p.includes('securitate') || p.includes('virus')) return CONTACTS.securitate;
  return CONTACTS.default;
}

function createTicket(problem, sessionId) {
  const contact = getContact(problem);
  const ticket = {
    id: `TICKET-${String(ticketCounter++).padStart(4, '0')}`,
    problem,
    sessionId,
    status: 'open',
    assignedTo: contact.name,
    contact: contact.contact,
    createdAt: new Date().toISOString()
  };
  tickets.push(ticket);
  fs.writeFileSync('tickets.json', JSON.stringify(tickets, null, 2));
  return ticket;
}

// 🌐 RUTA 1: Rularea de cod (Mutată AFARĂ din /chat)
app.post('/run-code', async (req, res) => {
  const { code, language } = req.body;
  try {
    const response = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: language, version: '*', files: [{ content: code }] })
    });
    const data = await response.json();
    res.json({ output: data.run?.output || 'Fără output', error: data.run?.stderr });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// 🌐 RUTA 2: Chatbot-ul Principal (Dual Engine)
app.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!histories[sessionId]) {
    histories[sessionId] = [{ role: "system", content: systemPrompt }];
  }

  // 1. Verificare Bază de Cunoștințe Rapidă
  const kb = searchKnowledge(message);
  if (kb) {
    return res.json({
      reply: `✅ **Soluție rapidă găsită:**\n\n🔍 **Problemă:** ${kb.problem}\n🔧 **Soluție:** ${kb.solution}`,
      engine: 'knowledge-base'
    });
  }

  histories[sessionId].push({ role: "user", content: message });
  let finalReply = "";
  let usedEngine = "";

  try {
    // 2. Încercare cu Groq (Mai rapid)
    const result = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", // Folosim modelul mai mic pentru limite mai bune
      messages: histories[sessionId],
      max_tokens: 1000
    });
    finalReply = result.choices[0].message.content;
    usedEngine = 'groq';

  } catch(e) {
    console.log(`⚠️ Groq indisponibil (${e.message}). Trec pe Gemini...`);
    
    try {
        // 3. Fallback pe Gemini dacă Groq pică
        // Convertim istoricul pentru formatul Gemini (fără system prompt, că e deja setat)
        const geminiHistory = histories[sessionId]
            .filter(msg => msg.role !== "system" && msg.role !== "user")
            .map(msg => ({ role: "model", parts: [{ text: msg.content }] }));
            
        const chat = geminiModel.startChat({ history: geminiHistory });
        const result = await chat.sendMessage(message);
        finalReply = result.response.text();
        usedEngine = 'gemini';
        
    } catch (geminiErr) {
        return res.status(500).json({ reply: "❌ Ambele servere AI sunt momentan indisponibile." });
    }
  }

  // Salvare răspuns în istoric
  histories[sessionId].push({ role: "assistant", content: finalReply });

  // 4. Verificare sistem de Tichete (Escaladare)
  let ticketData = null;
  if (finalReply.includes('ESCALADARE_NECESARA')) {
    ticketData = createTicket(message, sessionId);
    finalReply = `⚠️ **Această problemă necesită un specialist uman.**\n\n📋 **Ticket creat automat:**\n- **ID:** ${ticketData.id}\n- **Echipă:** ${ticketData.assignedTo}\n- **Status:** Deschis\n\nTe vom contacta în curând.`;
  }

  // Răspunsul final trimis către frontend
  res.json({ reply: finalReply, engine: usedEngine, ticket: ticketData });
});

// 🌐 RUTA 3: Vizualizare Tichete
app.get('/tickets', (req, res) => res.json(tickets));

// 🚀 Pornire Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Agent AI pornit la port ${PORT}`);
});
2. Pasul 2
✅ Rezultat așteptat: [ce ar trebui să se întâmple]

Răspunzi în limba utilizatorului.`
    }];
  }

  const kb = searchKnowledge(message);
  if (kb) {
    return res.json({
      reply: `✅ **Soluție găsită în Knowledge Base:**\n\n**Problemă:** ${kb.problem}\n**Soluție:** ${kb.solution}`,
      engine: 'knowledge-base',
      ticket: null
    });
  }

  histories[sessionId].push({ role: "user", content: message });

  try {
    const result = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: histories[sessionId],
      max_tokens: 1000
    });

    app.post('/run-code', async (req, res) => {
  const { code, language } = req.body;
  try {
    const response = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: language,
        version: '*',
        files: [{ content: code }]
      })
    });
    const data = await response.json();
    res.json({ output: data.run?.output || 'Fără output', error: data.run?.stderr });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

    let reply = result.choices[0].message.content;
    histories[sessionId].push({ role: "assistant", content: reply });

    let ticket = null;
    if (reply.includes('ESCALADARE_NECESARA')) {
      ticket = createTicket(message, sessionId);
      reply = `⚠️ Această problemă necesită un specialist uman.\n\n📋 **Ticket creat automat:**\n- ID: ${ticket.id}\n- Status: Deschis\n- Problema ta a fost înregistrată și vei fi contactat.`;
    }

    res.json({ reply, engine: 'groq', ticket });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/tickets', (req, res) => {
  res.json(tickets);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Agent AI pornit la port ${PORT}`);
});
