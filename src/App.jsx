"use client"

import { useState, useEffect } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import Login from "./Login"
import Signup from "./Signup"
import Chat from "./Chat"

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)

  // Check if user is logged in on app start
  useEffect(() => {
    const checkAuth = () => {
      const user = localStorage.getItem("user")
      const token = localStorage.getItem("token")

      if (user && token) {
        setIsLoggedIn(true)
      } else {
        setIsLoggedIn(false)
      }
      setLoading(false)
    }

    checkAuth()
  }, [])

  const handleLogin = (user, token) => {
    localStorage.setItem("user", JSON.stringify(user))
    localStorage.setItem("token", token)
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    localStorage.removeItem("user")
    localStorage.removeItem("token")
    setIsLoggedIn(false)
  }

  // Show loading while checking authentication status
  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>Loading...</div>
    )
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={isLoggedIn ? <Navigate to="/chat" replace /> : <Login onLogin={handleLogin} />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/chat"
          element={isLoggedIn ? <Chat onLogout={handleLogout} /> : <Navigate to="/login" replace />}
        />
        <Route path="/" element={<Navigate to={isLoggedIn ? "/chat" : "/login"} replace />} />
        <Route path="*" element={<Navigate to={isLoggedIn ? "/chat" : "/login"} replace />} />
      </Routes>
    </Router>
  )
}
