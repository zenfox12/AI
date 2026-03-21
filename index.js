require('dotenv').config();
const Groq = require("groq-sdk");
const readline = require("readline");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const history = [
  { role: "system", content: "Ești un AI expert în programare. Cunoști toate limbajele. Explici cod, scrii cod, depanezi erori. Răspunzi în limba în care ți se vorbește." }
];

console.log("🤖 Chatbot AI - Expert în Cod");
console.log("================================");
console.log("Scrie 'exit' pentru a ieși\n");

function intreaba() {
  rl.question("Tu: ", async (input) => {
    if (input === "exit") {
      console.log("La revedere!");
      rl.close();
      return;
    }
    history.push({ role: "user", content: input });
    try {
      const result = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: history,
        max_tokens: 1000
      });
      const reply = result.choices[0].message.content;
      history.push({ role: "assistant", content: reply });
      console.log("\n🤖 AI:", reply, "\n");
    } catch (e) {
      console.log("Eroare:", e.message);
    }
    intreaba();
  });
}

intreaba();
