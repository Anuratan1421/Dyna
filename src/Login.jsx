"use client"

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import "./App.css"
import backgroundImg from "./assets/bg2.png"

function Login({ onLogin }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage("")
    setIsLoading(true)

    try {
      const response = await fetch("https://dyna-rzvx.onrender.com/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok) {
        console.log("Login successful, calling onLogin")
        // Call onLogin first to update state
        onLogin(data.user, data.token)

        // Small delay to ensure state is updated
        setTimeout(() => {
          navigate("/chat", { replace: true })
          console.log("Navigated to /chat")
        }, 100)
      } else {
        setMessage(data.message || "Login failed")
      }
    } catch (error) {
      console.error("Login error:", error)
      setMessage("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-container" style={{ backgroundImage: `url(${backgroundImg})` }}>
      <div className="auth-form-card">
        <h2>Login</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email:</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <button type="submit" className="auth-button" disabled={isLoading}>
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>
        {message && <p className="auth-message">{message}</p>}
        <p className="auth-link-text">
          Don't have an account? <Link to="/signup">Sign Up</Link>
        </p>
      </div>
    </div>
  )
}

export default Login
