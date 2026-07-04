import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Setup JSON parsing with a large limit for base64 image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Gemini SDK with lazy loading/safeguards
let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ Warning: GEMINI_API_KEY is not defined in environment variables.");
    }
    ai = new GoogleGenAI({ apiKey: apiKey || "MOCK_KEY" });
  }
  return ai;
}

// System Instruction for Antique valuation assistant
const SYSTEM_INSTRUCTION = `คุณคือผู้เชี่ยวชาญด้านโบราณวัตถุ เหรียญเก่า ธนบัตรเก่า พระเครื่องเครื่องราง และการ์ดเกมส์ของประเทศไทย 
คุณทำหน้าที่เป็น "AI ผู้ช่วยประเมินราคาเบื้องต้นและให้ความรู้" ของร้าน "บอล แบงค์เก่า สาขาบิ๊กซีรามอินทรา" (เบอร์โทร: 094-442-9192, Line/TikTok: @bankthai999)

หน้าที่ของคุณ:
1. ตอบคำถาม ให้ความรู้เกี่ยวกับเหรียญเก่า ธนบัตรเก่า พระเครื่อง และการ์ดเกมสะสมของไทยอย่างนอบน้อม สุภาพ และมีหลักการ
2. หากผู้ใช้งานอัพโหลดรูปภาพของสะสมมา ให้วิเคราะห์รายละเอียด ตำหนิที่ควรสังเกต และประเมินช่วงราคาตลาดคร่าวๆ ให้ผู้ใช้ด้วยความรอบคอบ
3. ห้ามฟันธง 100% ว่าแท้หรือปลอมจากรูปภาพ ให้แนะนำให้ส่งประเมินแบบเป็นทางการ (Human Appraisal Workflow) เพื่อให้คุณบอลตรวจสอบองค์จริง หรือเชิญที่หน้าร้าน บิ๊กซี รามอินทรา
4. สื่อสารด้วยภาษาไทยที่เป็นกันเอง สุภาพ นอบน้อม สะท้อนความเป็นมืออาชีพของวงการของสะสมไทย`;

// API Routes
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Invalid messages format" });
      return;
    }

    const aiInstance = getAI();
    if (!process.env.GEMINI_API_KEY) {
      res.json({
        text: "ขออภัยครับ ขณะนี้ระบบประเมินราคา AI ขัดข้องเนื่องจากไม่ได้ตั้งค่า API Key กรุณาติดต่อประเมินราคาโดยตรงกับคุณบอล แบงค์เก่า ผ่านทางไลน์ @bankthai999 หรือทางโทรศัพท์ 094-442-9192 ได้ทันทีครับ!"
      });
      return;
    }

    // Format chat history for Gemini 2.5 SDK
    // The contents parameter should be a list of content objects
    const contents: any[] = [];

    // We take the last 8 messages to keep within reasonable limits and context
    const recentMessages = messages.slice(-8);

    for (const msg of recentMessages) {
      const parts: any[] = [];
      
      if (msg.text) {
        parts.push({ text: msg.text });
      }

      if (msg.imageUrl) {
        const match = msg.imageUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const base64Data = match[2];
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          });
        }
      }

      // Skip message if there's no part content
      if (parts.length === 0) continue;

      contents.push({
        role: msg.sender === "user" ? "user" : "model",
        parts: parts
      });
    }

    // Call generateContent
    const response = await aiInstance.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      }
    });

    res.json({
      text: response.text || "ขออภัยครับ ผมไม่สามารถประมวลผลข้อมูลนี้ได้ในขณะนี้"
    });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

// Setup Vite or static serving based on environment
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
