import express from "express"
import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import cors from "cors"
import dotenv from "dotenv"
import jwt from "jsonwebtoken"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

const MONGODB_URI = process.env.MONGO_URI
const JWT_SECRET = process.env.JWT_SECRET || "default_secret_key" // Use a strong secret in production!

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err))

// Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
})

const User = mongoose.model("DynaUser", userSchema)

// Signup Route
app.post("/api/signup", async (req, res) => {
  const { email, password } = req.body
  try {
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const newUser = new User({
      email,
      password: hashedPassword,
    })

    await newUser.save()

    // For signup, we don't necessarily need to send a token back to the client
    // if the client immediately redirects to login.
    // However, if you want to auto-login after signup, you'd use this token.
    // For now, keeping it as per your original code, but the frontend doesn't use it.
    const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: "7d" })

    res.status(201).json({
      message: "User registered successfully",
      token, // Frontend doesn't use this for signup, but it's here if needed later
      userId: newUser._id, // Frontend doesn't use this for signup, but it's here if needed later
    })
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server error")
  }
})

// Login Route
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body
  try {
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" })
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" })

    // Corrected: Wrap userId and email in a 'user' object for the frontend
    res.json({
      message: "Logged in successfully",
      token,
      user: {
        userId: user._id,
        email: user.email,
      },
    })
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server error")
  }
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
