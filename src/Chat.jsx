"use client"
import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import "./Chat.css"

function Chat({ onLogout }) {
  const [user, setUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState("text")
  const [continuousMode, setContinuousMode] = useState(false)
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [hasSpoken, setHasSpoken] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navigate = useNavigate()
  const recognitionRef = useRef(null)
  const synthRef = useRef(null)
  const messagesEndRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const microphoneRef = useRef(null)
  const animationFrameRef = useRef(null)
  const silenceTimeoutRef = useRef(null)
  const speechTimeoutRef = useRef(null)

  // Initialize speech recognition and synthesis
  useEffect(() => {
    initializeSpeechRecognition()
    initializeSpeechSynthesis()
    return () => {
      cleanup()
    }
  }, [])

  const initializeSpeechRecognition = () => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = "en-US"

      recognitionRef.current.onstart = () => {
        setIsListening(true)
        setHasSpoken(false)
        if (mode === "voice") {
          startVoiceLevelDetection()
        }
      }

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = ""
        let interimTranscript = ""
        let hasNewFinal = false

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.trim()
          if (event.results[i].isFinal) {
            finalTranscript += transcript + " "
            hasNewFinal = true
          } else {
            interimTranscript += transcript
          }
        }

        const currentTranscript = finalTranscript || interimTranscript
        if (currentTranscript) {
          setNewMessage(currentTranscript)
          setHasSpoken(true)

          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
          }

          if (hasNewFinal && mode === "voice") {
            silenceTimeoutRef.current = setTimeout(() => {
              if (hasSpoken && currentTranscript.trim()) {
                handleSendMessage(null, currentTranscript.trim())
              }
            }, 1500)
          }
        }
      }

      recognitionRef.current.onerror = (event) => {
        if (event.error !== "no-speech") {
          setIsListening(false)
          stopVoiceLevelDetection()
        }
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
        stopVoiceLevelDetection()

        if (hasSpoken && newMessage.trim() && mode === "voice" && !isLoading) {
          handleSendMessage(null, newMessage.trim())
        } else if (mode === "voice" && continuousMode && !isSpeaking && !isLoading) {
          setTimeout(() => {
            startListening()
          }, 2000)
        }
      }
    }
  }

  const initializeSpeechSynthesis = () => {
    if ("speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis
    }
  }

  const startVoiceLevelDetection = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream)
      microphoneRef.current.connect(analyserRef.current)
      analyserRef.current.fftSize = 256

      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const updateVoiceLevel = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / bufferLength
        setVoiceLevel(average)
        animationFrameRef.current = requestAnimationFrame(updateVoiceLevel)
      }

      updateVoiceLevel()
    } catch (error) {
      console.error("Error accessing microphone:", error)
    }
  }

  const stopVoiceLevelDetection = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close()
    }
    setVoiceLevel(0)
  }

  const cleanup = () => {
    if (recognitionRef.current) recognitionRef.current.stop()
    if (synthRef.current) synthRef.current.cancel()
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current)
    stopVoiceLevelDetection()
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    const userData = localStorage.getItem("user")
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData)
        setUser(parsedUser)
        loadMessages(parsedUser.userId)
      } catch (error) {
        handleLogout()
      }
    } else {
      handleLogout()
    }
  }, [])

  useEffect(() => {
    if (mode === "voice") {
      setContinuousMode(true)
      setTimeout(() => startListening(), 500)
    } else {
      setContinuousMode(false)
      stopListening()
    }
  }, [mode])

  const loadMessages = async (userId) => {
    try {
      const response = await fetch(`https://dyna-1.onrender.com/api/messages/${userId}/dnya`)
      if (response.ok) {
        const data = await response.json()
        const formattedMessages = data.messages.map((msg) => ({
          id: msg._id,
          text: msg.content,
          sender: msg.senderId === userId ? user?.email || "You" : "Dnya",
          timestamp: new Date(msg.timestamp).toLocaleTimeString(),
          isAI: msg.senderId === "dnya",
        }))
        setMessages(formattedMessages)
      }
    } catch (error) {
      console.error("Error loading messages:", error)
    }
  }

  const handleLogout = () => {
    cleanup()
    onLogout()
    navigate("/login", { replace: true })
  }

  const startListening = () => {
    if (recognitionRef.current && !isListening && !isSpeaking && !isLoading) {
      try {
        setNewMessage("")
        setHasSpoken(false)
        recognitionRef.current.start()
      } catch (error) {
        console.error("Error starting speech recognition:", error)
      }
    }
  }

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
    }
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current)
    stopVoiceLevelDetection()
  }

  const speakText = (text) => {
    return new Promise((resolve) => {
      if (synthRef.current && !isSpeaking) {
        synthRef.current.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.9
        utterance.pitch = 1
        utterance.volume = 0.8

        utterance.onstart = () => {
          setIsSpeaking(true)
          setIsListening(false)
        }

        utterance.onend = () => {
          setIsSpeaking(false)
          resolve()
          if (mode === "voice" && continuousMode) {
            setTimeout(() => startListening(), 1000)
          }
        }

        utterance.onerror = () => {
          setIsSpeaking(false)
          resolve()
        }

        synthRef.current.speak(utterance)
      } else {
        resolve()
      }
    })
  }

  const handleSendMessage = async (e, messageText = null) => {
    if (e) e.preventDefault()
    const messageToSend = messageText || newMessage

    if (messageToSend.trim() && user && !isLoading) {
      setIsLoading(true)
      stopListening()

      const userMessage = {
        id: Date.now(),
        text: messageToSend,
        sender: user?.email || "You",
        timestamp: new Date().toLocaleTimeString(),
        isAI: false,
      }

      setMessages((prev) => [...prev, userMessage])
      setNewMessage("")
      setHasSpoken(false)

      try {
        const response = await fetch("https://dyna-1.onrender.com/generate-response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: messageToSend, userId: user.userId }),
        })

        if (response.ok) {
          const data = await response.json()
          const aiMessage = {
            id: Date.now() + 1,
            text: data.reply,
            sender: "Dnya",
            timestamp: new Date().toLocaleTimeString(),
            isAI: true,
          }

          setMessages((prev) => [...prev, aiMessage])

          if (mode === "voice" || continuousMode) {
            await speakText(data.reply)
          }
        }
      } catch (error) {
        console.error("Error sending message:", error)
        const errorMessage = {
          id: Date.now() + 1,
          text: "Sorry, I couldn't process your message. Please try again.",
          sender: "Dnya",
          timestamp: new Date().toLocaleTimeString(),
          isAI: true,
        }
        setMessages((prev) => [...prev, errorMessage])
      } finally {
        setIsLoading(false)
      }
    }
  }

  const toggleMode = (newMode) => {
    if (newMode !== mode) {
      stopListening()
      setNewMessage("")
      setHasSpoken(false)
      setMode(newMode)
    }
  }

  if (!user) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className={`chat-app ${isDarkMode ? "dark" : "light"}`}>
      {/* Mobile Sidebar */}
      <div className={`mobile-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="mobile-sidebar-header">
          <div className="logo">
            <div className="logo-icon">D</div>
            <span className="logo-text">Dnya Assistant</span>
          </div>
          <button className="close-sidebar" onClick={() => setSidebarOpen(false)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="mobile-sidebar-nav">
          <div className="nav-item active">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Chat</span>
          </div>
          <div className="nav-item">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>History</span>
          </div>
          <div className="nav-item">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </div>
        </nav>

        <div className="mobile-sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">{user?.email?.charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{user?.email}</div>
              <div className="user-status">Online</div>
            </div>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Sidebar Overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? "active" : ""}`} onClick={() => setSidebarOpen(false)}></div>

      {/* Desktop Sidebar */}
      <aside className="desktop-sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">D</div>
            <span className="logo-text">Dnya Assistant</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-item active">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Chat</span>
          </div>
          <div className="nav-item">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>History</span>
          </div>
          <div className="nav-item">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">{user?.email?.charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{user?.email}</div>
              <div className="user-status">Online</div>
            </div>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="chat-header">
          <div className="header-left">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="chat-title">Dnya Assistant</h1>
          </div>
          <div className="header-right">
            <button className="theme-toggle" onClick={() => setIsDarkMode(!isDarkMode)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {isDarkMode ? (
                  <circle cx="12" cy="12" r="5" />
                ) : (
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                )}
              </svg>
            </button>
          </div>
        </header>

        {/* Mode Selector */}
        <div className="mode-selector">
          <button className={`mode-btn ${mode === "text" ? "active" : ""}`} onClick={() => toggleMode("text")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10,9 9,9 8,9" />
            </svg>
            Text
          </button>
          <button className={`mode-btn ${mode === "voice" ? "active" : ""}`} onClick={() => toggleMode("voice")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            Voice
          </button>
        </div>

        {/* Voice Interface */}
        {mode === "voice" && (
          <div className="voice-panel">
            <div className="voice-status">
              <div
                className={`voice-indicator ${isListening ? "listening" : ""} ${isSpeaking ? "speaking" : ""} ${isLoading ? "thinking" : ""}`}
              >
                <div className="voice-circle">
                  <div className="voice-level" style={{ height: `${Math.min(voiceLevel * 2, 100)}%` }}></div>
                </div>
              </div>
              <div className="voice-text">
                {isLoading
                  ? "Processing..."
                  : isSpeaking
                    ? "Speaking..."
                    : isListening
                      ? hasSpoken
                        ? "Processing speech..."
                        : "Listening..."
                      : "Tap to start voice chat"}
              </div>
            </div>

            {newMessage && (
              <div className="voice-transcript">
                <div className="transcript-label">Transcript:</div>
                <div className="transcript-text">"{newMessage}"</div>
              </div>
            )}

            <div className="voice-controls">
              <button
                className={`voice-btn ${isListening ? "active" : ""}`}
                onClick={isListening ? stopListening : startListening}
                disabled={isLoading || isSpeaking}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {isListening ? (
                    <rect x="6" y="4" width="4" height="16" rx="2" />
                  ) : (
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  )}
                </svg>
                {isListening ? "Stop" : "Start"}
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className={`messages-container ${mode === "voice" ? "with-voice-panel" : ""}`}>
          <div className="messages-wrapper">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3>Welcome to Dnya Assistant</h3>
                <p>Start a conversation by {mode === "text" ? "typing a message" : "using voice commands"}</p>
              </div>
            ) : (
              <div className="messages-list">
                {messages.map((message) => (
                  <div key={message.id} className={`message ${message.isAI ? "ai" : "user"}`}>
                    <div className="message-avatar">{message.isAI ? "AI" : user?.email?.charAt(0).toUpperCase()}</div>
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-sender">{message.isAI ? "Dnya Assistant" : "You"}</span>
                        <span className="message-time">{message.timestamp}</span>
                      </div>
                      <div className="message-text">{message.text}</div>
                      {message.isAI && (
                        <div className="message-actions">
                          <button
                            className="action-btn"
                            onClick={() => speakText(message.text)}
                            disabled={isSpeaking}
                            title="Read aloud"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="message ai">
                    <div className="message-avatar">AI</div>
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-sender">Dnya Assistant</span>
                      </div>
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        {mode === "text" && (
          <div className="input-container">
            <form onSubmit={handleSendMessage} className="message-form">
              <div className="input-wrapper">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="message-input"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`voice-input-btn ${isListening ? "active" : ""}`}
                  disabled={isLoading}
                  title="Voice input"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>
              </div>
              <button type="submit" className="send-btn" disabled={isLoading || !newMessage.trim()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22,2 15,22 11,13 2,9 22,2" />
                </svg>
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}

export default Chat
