"use client"

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import backgroundImg from "./assets/bg2.png"

function Signup() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage("") // Clear previous messages

    try {
      const response = await fetch("https://dyna-rzvx.onrender.com/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(data.message + ". Redirecting to login...")
        setTimeout(() => navigate("https://dyna-wine.vercel.app/Login"), 2000) // Redirect to login after 2 seconds
      } else {
        setMessage(data.message || "Signup failed")
      }
    } catch (error) {
      console.error("Error during signup:", error)
      setMessage("An error occurred. Please try again.")
    }
  }

  return (
    <div className="auth-container" style={{ backgroundImage: `url(${backgroundImg})` }}>
      <div className="auth-form-card">
        <img src="/assets/signup-girl.png" alt="Sign Up" className="auth-character-image" />
        <h2>Sign Up</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email:</label>
            <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="auth-button">
            Sign Up
          </button>
        </form>
        {message && <p className="auth-message">{message}</p>}
        <p className="auth-link-text">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  )
}

export default Signup
