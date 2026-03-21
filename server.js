require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.json());
app.use(express.static('public'));

const knowledgeBase = [
  { problem: "npm not found", solution: "Instalează Node.js de la nodejs.org și repornește terminalul." },
  { problem: "cannot find module", solution: "Rulează 'npm install' în folderul proiectului." },
  { problem: "port already in use", solution: "Rulează 'npx kill-port 3000' sau schimbă portul în cod." },
  { problem: "git push rejected", solution: "Rulează 'git pull origin main' înainte de push." },
  { problem: "cors error", solution: "Adaugă 'npm install cors' și 'app.use(require(cors)())' în server." },
  { problem: "undefined is not a function", solution: "Verifică că funcția există și e importată corect." },
  { problem: "api key invalid", solution: "Verifică că cheia e în .env și că ai apelat require('dotenv').config()." },
  { problem: "syntax error", solution: "Verifică parantezele și ghilimelele în cod. Folosește VS Code pentru highlight." },
  { problem: "sandbox", solution: "Sandbox-ul este un mediu izolat pentru rularea codului. Folosește tab-ul 'Cod' din FireBot AI pentru a rula cod în sandbox securizat!" },
{ problem: "run code", solution: "Poți rula cod direct în tab-ul 'Cod' — selectează limbajul și apasă butonul verde 'Rulează'!" },
];

const histories = {};
let ticketCounter = 1;
const tickets = [];

function searchKnowledge(query) {
  const q = query.toLowerCase();
  return knowledgeBase.find(item => q.includes(item.problem.toLowerCase()));
}

const CONTACTS = {
  'retea': { name: 'Network Team', contact: 'network@support.com' },
  'hardware': { name: 'Hardware Team', contact: 'hardware@support.com' },
  'securitate': { name: 'Security Team', contact: 'security@support.com' },
  'default': { name: 'Senior Developer', contact: 'senior@support.com' }
};

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
  // Salvează în fișier
  require('fs').writeFileSync('tickets.json', JSON.stringify(tickets, null, 2));
  return ticket;
}

app.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!histories[sessionId]) {
    histories[sessionId] = [{
      role: "system",
      content: `Ești TechSupport AI, un agent specializat DOAR în suport tehnic.

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
