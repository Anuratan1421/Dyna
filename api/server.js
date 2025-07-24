// Enhanced server implementation with Socket.io for real-time features
import express from "express"
import cors from "cors"
import bodyParser from "body-parser"
import dotenv from "dotenv"
import mongoose from "mongoose"
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { ConversationChain } from "langchain/chains"
import { BufferMemory } from "langchain/memory"
import { Pinecone } from "@pinecone-database/pinecone"
import { PineconeStore } from "@langchain/community/vectorstores/pinecone"
import { PromptTemplate } from "@langchain/core/prompts"
import http from "http"


dotenv.config()

const app = express()
app.use(cors())
app.use(bodyParser.json())

const server = http.createServer(app)



// Connect to MongoDB
mongoose
  .connect("mongodb+srv://anuratan:Anuratan%401421@cluster0.0uo5r.mongodb.net/?retryWrites=true&w=majority")
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err))

// Define Message Schema
const messageSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true,
  },
  receiverId: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
})

// Define User Schema for consent management
const AiuserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  hasConsented: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  email: {
    type: String,
    required: false,
  },
})

const Message = mongoose.model("Message", messageSchema)
const User = mongoose.model("AiUser", AiuserSchema)

const memoryMap = {} // userId -> Chain
const vectorStoreMap = {} // userId -> Pinecone vector store

// Pinecone config
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
})

// Get the index name from environment or use the hardcoded value
const INDEX_NAME = process.env.PINECONE_INDEX_NAME || "dnyanu"

// Function to initialize conversation history from MongoDB
async function loadConversationHistory(userId) {
  try {
    // Get past messages between this user and the AI
    const pastMessages = await Message.find({
      $or: [
        { senderId: userId, receiverId: "dnya" },
        { senderId: "dnya", receiverId: userId },
      ],
    })
      .sort({ timestamp: 1 })
      .limit(20) // Get the last 20 messages

    // Format past messages as a conversation history
    const history = []
    for (const msg of pastMessages) {
      if (msg.senderId === userId) {
        history.push({ type: "human", text: msg.content })
      } else {
        history.push({ type: "ai", text: msg.content })
      }
    }

    return history
  } catch (error) {
    console.error("Error loading conversation history:", error)
    return []
  }
}

// Create a user-specific chatbot chain
async function createUserChain(userId) {
  try {
    // 1. Create embedding model
    const embeddings = new GoogleGenerativeAIEmbeddings({
      modelName: "embedding-001",
      apiKey: process.env.GEMINI_API_KEY,
    })

    // 2. Connect to Pinecone index
    const pineconeIndex = pinecone.Index(INDEX_NAME)

    // 3. Create or connect to vector store for this user
    const namespace = `user-${userId}`
    let vectorStore

    try {
      // Try to connect to existing vector store
      vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex,
        namespace,
      })
    } catch (error) {
     // console.log("Vector store not found, creating new one:", error.message)

      // Create new vector store if it doesn't exist
      vectorStore = await PineconeStore.fromDocuments(
        [{ pageContent: "Initial message for user", metadata: { userId } }],
        embeddings,
        { pineconeIndex, namespace },
      )
    }

    vectorStoreMap[userId] = vectorStore

    // 4. Set up chat model
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      temperature: 0.7,
      apiKey: process.env.GEMINI_API_KEY,
    })

    // 5. Load conversation history
    const pastMessages = await loadConversationHistory(userId)

    // 6. Create memory with past messages
    const memory = new BufferMemory({
      returnMessages: true,
      memoryKey: "history",
      inputKey: "input",
    })

    // Pre-load the memory with past conversations
    if (pastMessages.length > 0) {
      for (let i = 0; i < pastMessages.length - 1; i += 2) {
        if (pastMessages[i] && pastMessages[i + 1]) {
          await memory.saveContext({ input: pastMessages[i].text }, { output: pastMessages[i + 1].text })
        }
      }
    }

    // 7. Create a basic conversation chain with memory
    const chain = new ConversationChain({
      llm: model,
      memory: memory,
      prompt: PromptTemplate.fromTemplate(
        `You are Dyna, a helpful and context-aware assistant. The following is a conversation between you and a human user.
        
        History: {history}
        Human: {input}
        AI: `,
      ),
    })

    memoryMap[userId] = {
      chain: chain,
      vectorStore: vectorStore,
    }

    return chain
  } catch (error) {
    console.error("Error creating user chain:", error)

    // Fall back to basic conversation without retrieval
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-flash",
      temperature: 0.7,
      apiKey: process.env.GEMINI_API_KEY,
    })

    const memory = new BufferMemory({
      returnMessages: true,
      memoryKey: "history",
      inputKey: "input",
    })

    // Load conversation history into memory
    const pastMessages = await loadConversationHistory(userId)
    if (pastMessages.length > 0) {
      for (let i = 0; i < pastMessages.length - 1; i += 2) {
        if (pastMessages[i] && pastMessages[i + 1]) {
          await memory.saveContext({ input: pastMessages[i].text }, { output: pastMessages[i + 1].text })
        }
      }
    }

    const chain = new ConversationChain({
      llm: model,
      memory: memory,
      prompt: PromptTemplate.fromTemplate(
        `You are Dyna, a helpful and context-aware assistant. The following is a conversation between you and a human user.
        
        History: {history}
        Human: {input}
        AI: `,
      ),
    })
    memoryMap[userId] = {
      chain: chain,
      vectorStore: null,
    }
    return chain
  }
}

// Get or create user
app.post("/api/users", async (req, res) => {
  try {
    const { userId, email } = req.body

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" })
    }

    // Find user or create if doesn't exist
    let user = await User.findOne({ userId })

    if (!user) {
      user = new User({ userId, email })
      await user.save()
    }

    res.json({ user })
  } catch (error) {
    console.error("Error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Update user consent
app.put("/api/users/consent", async (req, res) => {
  try {
    const { userId, hasConsented } = req.body

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" })
    }

    const user = await User.findOneAndUpdate({ userId }, { hasConsented }, { new: true, upsert: true })

    res.json({ user })
  } catch (error) {
    console.error("Error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get messages between user and Dnya
app.get("/api/messages/:userId/dnya", async (req, res) => {
  try {
    const { userId } = req.params

    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: "dnya" },
        { senderId: "dnya", receiverId: userId },
      ],
    }).sort({ timestamp: 1 })

    res.json({ messages })
  } catch (error) {
    console.error("Error fetching messages:", error)
    res.status(500).json({ error: "Failed to fetch messages" })
  }
})



// Legacy endpoint for backward compatibility
// Helper to fetch recent chronological messages
async function getRecentMessages(userId, limit = 6) {
  return await Message.find({
    $or: [
      { senderId: userId, receiverId: "dnya" },
      { senderId: "dnya", receiverId: userId },
    ],
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean()
    .then((msgs) => msgs.reverse());
}

app.post("/api/generate-response", async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message || !userId) {
      return res.status(400).json({ error: "Message and userId are required" });
    }

    // Save user message to DB
    const userMessage = new Message({
      senderId: userId,
      receiverId: "dnya",
      content: message,
    });
    await userMessage.save();

    // Initialize chain if not exists
    if (!memoryMap[userId]) {
      await createUserChain(userId);
    }

    // Retrieve similar messages (optional context)
    let similarDocuments = [];
    try {
      if (memoryMap[userId].vectorStore) {
        similarDocuments = await memoryMap[userId].vectorStore.similaritySearch(message, 3);
      }
    } catch (error) {
      console.log("Vector store similarity error:", error.message);
    }

    // Store user message in vector DB
    try {
      if (memoryMap[userId].vectorStore) {
        await memoryMap[userId].vectorStore.addDocuments([
          {
            pageContent: message,
            metadata: {
              userId,
              timestamp: new Date().toISOString(),
              type: "user_message",
            },
          },
        ]);
      }
    } catch (error) {
      console.log("Vector store write error:", error.message);
    }

    // Get recent message history
    const recentMessages = await getRecentMessages(userId);
    const conversationHistory = recentMessages
      .map((msg) => `${msg.senderId === userId ? "You" : "AI"}: ${msg.content}`)
      .join("\n");

    const contextList = similarDocuments.map((doc) => `- ${doc.pageContent}`).join("\n");

    // Friendly prompt generation
    const contextEnhancedPrompt = `
You're the user's sweet, fun best friend. Talk short, real, and friendly. Be helpful by default, but when needed, add light nok-jhok or playful teasing — never rude or arrogant.

Only use the past messages or preferences if they help naturally — not forced. Avoid robotic responses.

Here's your recent chat:
${conversationHistory}

${
  contextList
    ? `Some past things the user mentioned (if needed):\n${contextList}\n`
    : ""
}

Now the user asked:
"${message}"

Reply like a best friend — short, real, warm. Add nok-jhok or fun tone *only when it fits*. Never sound robotic or formal.
`.trim();

    // Generate with memory chain
    let result;
    try {
      result = await memoryMap[userId].chain.call({
        input: contextEnhancedPrompt,
      });
    } catch (error) {
      console.error("Chain call failed:", error);

      // Fallback using Gemini
      const model = new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
        temperature: 0.8,
        apiKey: process.env.GEMINI_API_KEY,
      });

      try {
        const fallbackResponse = await model.invoke(contextEnhancedPrompt);
        result = { response: fallbackResponse.text() };
      } catch (innerError) {
        console.error("Gemini fallback failed:", innerError);
        result = { response: "Uff, my brain’s on break 😵. Ask again?" };
      }
    }

    const aiResponse = result.response || "I'm blank 😅, say that again?";

    // Save AI reply to DB
    const aiMessage = new Message({
      senderId: "dnya",
      receiverId: userId,
      content: aiResponse,
    });
    await aiMessage.save();

    // Store AI reply in vector DB
    try {
      if (memoryMap[userId].vectorStore) {
        await memoryMap[userId].vectorStore.addDocuments([
          {
            pageContent: aiResponse,
            metadata: {
              userId,
              timestamp: new Date().toISOString(),
              type: "ai_response",
            },
          },
        ]);
      }
    } catch (error) {
      console.log("Vector store AI save error:", error.message);
    }

    res.json({ reply: aiResponse, userId });
  } catch (error) {
    console.error("Main error:", error);
    res.status(500).json({ error: "AI failed", details: error.message });
  }
});




const PORT = 7000
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`)
})
