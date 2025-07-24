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
  const [mode, setMode] = useState("text") // "text" or "voice"
  const [continuousMode, setContinuousMode] = useState(false)
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [silenceTimer, setSilenceTimer] = useState(null)
  const [hasSpoken, setHasSpoken] = useState(false)

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
  const lastSpeechTimeRef = useRef(null)

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
      recognitionRef.current.maxAlternatives = 1

      recognitionRef.current.onstart = () => {
        console.log("Speech recognition started")
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

        // Update the message with interim or final results
        const currentTranscript = finalTranscript || interimTranscript
        if (currentTranscript) {
          setNewMessage(currentTranscript)
          setHasSpoken(true)
          lastSpeechTimeRef.current = Date.now()

          // Clear any existing silence timeout
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
          }

          // If we have final results and we're in voice mode, set a shorter timeout
          if (hasNewFinal && mode === "voice") {
            silenceTimeoutRef.current = setTimeout(() => {
              if (hasSpoken && currentTranscript.trim()) {
                handleSendMessage(null, currentTranscript.trim())
              }
            }, 1500) // 1.5 seconds after final speech
          }
        }
      }

      recognitionRef.current.onerror = (event) => {
        console.error("Speech recognition error:", event.error)
        if (event.error !== "no-speech") {
          setIsListening(false)
          stopVoiceLevelDetection()
        }
      }

      recognitionRef.current.onend = () => {
        console.log("Speech recognition ended")
        setIsListening(false)
        stopVoiceLevelDetection()

        // If we have spoken content and we're in voice mode, send it
        if (hasSpoken && newMessage.trim() && mode === "voice" && !isLoading) {
          handleSendMessage(null, newMessage.trim())
        }
        // Restart listening in continuous voice mode after AI response
        else if (mode === "voice" && continuousMode && !isSpeaking && !isLoading) {
          setTimeout(() => {
            startListening()
          }, 2000)
        }
      }

      recognitionRef.current.onspeechstart = () => {
        console.log("Speech detected")
        setHasSpoken(true)
        // Clear any existing timeouts when speech starts
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current)
        }
        if (speechTimeoutRef.current) {
          clearTimeout(speechTimeoutRef.current)
        }
      }

      recognitionRef.current.onspeechend = () => {
        console.log("Speech ended")
        // Set a timeout to stop listening after speech ends
        speechTimeoutRef.current = setTimeout(() => {
          if (recognitionRef.current && isListening) {
            recognitionRef.current.stop()
          }
        }, 1000) // Stop 1 second after speech ends
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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream)

      microphoneRef.current.connect(analyserRef.current)
      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8

      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      let silenceStart = Date.now()
      const SILENCE_THRESHOLD = 10
      const SILENCE_DURATION = 2000 // 2 seconds of silence

      const updateVoiceLevel = () => {
        if (!analyserRef.current) return

        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / bufferLength
        setVoiceLevel(average)

        // Detect silence
        if (average < SILENCE_THRESHOLD) {
          if (Date.now() - silenceStart > SILENCE_DURATION && hasSpoken && newMessage.trim()) {
            // Auto-stop listening after prolonged silence
            if (recognitionRef.current && isListening) {
              recognitionRef.current.stop()
            }
            return
          }
        } else {
          silenceStart = Date.now()
        }

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
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
    }
    setVoiceLevel(0)
  }

  const cleanup = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    if (synthRef.current) {
      synthRef.current.cancel()
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
    }
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current)
    }
    stopVoiceLevelDetection()
  }

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Get user data from localStorage
  useEffect(() => {
    const userData = localStorage.getItem("user")
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData)
        setUser(parsedUser)
        console.log("User loaded:", parsedUser.userId)
        loadMessages(parsedUser.userId)
      } catch (error) {
        console.error("Error parsing user data:", error)
        handleLogout()
      }
    } else {
      handleLogout()
    }
  }, [])

  // Handle mode changes
  useEffect(() => {
    if (mode === "voice") {
      setContinuousMode(true)
      // Auto-start listening in voice mode
      setTimeout(() => {
        startListening()
      }, 500)
    } else {
      setContinuousMode(false)
      stopListening()
    }
  }, [mode])

  const loadMessages = async (userId) => {
    try {
      const response = await fetch(`http://localhost:7000/api/messages/${userId}/dnya`)
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
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
    }
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current)
    }
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
          setIsListening(false) // Ensure we're not listening while speaking
        }
        
        utterance.onend = () => {
          setIsSpeaking(false)
          resolve()
          
          // Auto-restart listening in voice mode after speaking
          if (mode === "voice" && continuousMode) {
            setTimeout(() => {
              startListening()
            }, 1000)
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

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel()
      setIsSpeaking(false)
    }
  }

  const handleSendMessage = async (e, messageText = null) => {
    if (e) e.preventDefault()

    const messageToSend = messageText || newMessage
    if (messageToSend.trim() && user && !isLoading) {
      setIsLoading(true)
      stopListening() // Stop listening while processing

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
        const response = await fetch("http://localhost:7000/api/generate-response", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: messageToSend,
            userId: user.userId,
          }),
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

          // Speak the AI response
          if (mode === "voice" || continuousMode) {
            await speakText(data.reply)
          }
        } else {
          throw new Error("Failed to get AI response")
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
      stopSpeaking()
      setNewMessage("")
      setHasSpoken(false)
      setMode(newMode)
    }
  }

  const getVoiceStatus = () => {
    if (isLoading) return "Thinking..."
    if (isSpeaking) return "Speaking..."
    if (isListening && hasSpoken) return "Processing..."
    if (isListening) return "Listening..."
    return "Tap to start conversation"
  }

  if (!user) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading chat...</p>
      </div>
    )
  }

  return (
    <div className={`chat-container ${mode}`}>
      {/* Header */}
      <div className="chat-header">
        <div className="header-left">
          <h1>Dnya Assistant</h1>
          <span className="user-info">Welcome, {user.email}</span>
        </div>
        <div className="header-right">
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="mode-toggle">
        <button className={`mode-btn ${mode === "text" ? "active" : ""}`} onClick={() => toggleMode("text")}>
          <span className="mode-icon">💬</span>
          <span>Text</span>
        </button>
        <button className={`mode-btn ${mode === "voice" ? "active" : ""}`} onClick={() => toggleMode("voice")}>
          <span className="mode-icon">🎤</span>
          <span>Voice</span>
        </button>
      </div>

      {/* Voice Mode Interface */}
      {mode === "voice" && (
        <div className="voice-interface">
          <div className="voice-visualizer">
            <div className="voice-circle">
              <div
                className={`voice-pulse ${isListening && !hasSpoken ? "listening" : ""} ${
                  isListening && hasSpoken ? "processing" : ""
                } ${isSpeaking ? "speaking" : ""} ${isLoading ? "thinking" : ""}`}
                style={{
                  transform: `scale(${1 + (voiceLevel / 100) * 0.3})`,
                }}
              >
                <div className="voice-inner">
                  {isLoading ? (
                    <div className="thinking-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  ) : isSpeaking ? (
                    "🔊"
                  ) : isListening && hasSpoken ? (
                    "⚡"
                  ) : isListening ? (
                    "🎤"
                  ) : (
                    "💬"
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="voice-status">
            <p>{getVoiceStatus()}</p>
          </div>

          {newMessage && (
            <div className="voice-transcript">
              <p>"{newMessage}"</p>
            </div>
          )}

          <div className="voice-controls">
            <button
              className={`voice-control-btn ${isListening ? "active" : ""}`}
              onClick={isListening ? stopListening : startListening}
              disabled={isLoading || isSpeaking}
            >
              {isListening ? "Stop" : "Start"}
            </button>
            {isSpeaking && (
              <button className="voice-control-btn stop" onClick={stopSpeaking}>
                Stop Speaking
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages Container */}
      <div className={`messages-container ${mode === "voice" ? "voice-mode" : ""}`}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🤖</div>
            <h3>Hi! I'm Dnya</h3>
            <p>{mode === "text" ? "Type a message to start our conversation" : "Speak to start our conversation"}</p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`message ${message.isAI ? "ai-message" : "user-message"}`}>
              <div className="message-avatar">{message.isAI ? "🤖" : "👤"}</div>
              <div className="message-bubble">
                <div className="message-content">{message.text}</div>
                <div className="message-time">{message.timestamp}</div>
                {message.isAI && mode === "text" && (
                  <button
                    className="speak-btn"
                    onClick={() => speakText(message.text)}
                    disabled={isSpeaking}
                    title="Speak this message"
                  >
                    🔊
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="message ai-message">
            <div className="message-avatar">🤖</div>
            <div className="message-bubble loading">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Text Mode Input */}
      {mode === "text" && (
        <form onSubmit={handleSendMessage} className="message-form">
          <div className="input-container">
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
              className={`voice-btn ${isListening ? "listening" : ""}`}
              disabled={isLoading}
              title="Voice input"
            >
              🎤
            </button>
          </div>
          <button type="submit" className="send-btn" disabled={isLoading || !newMessage.trim()}>
            {isLoading ? "..." : "Send"}
          </button>
        </form>
      )}
    </div>
  )
}

export default Chat
