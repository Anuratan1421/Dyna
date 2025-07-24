
import "./App.css"
import backgroundImg from "./assets/bg2.png" // Ensure these paths are correct in your project
import characterImg from "./assets/ch2.png" // Ensure these paths are correct in your project
import { useNavigate} from "react-router-dom"

export default function Home() {
    console.log("Home rendered");
console.log("BG:", backgroundImg);
console.log("Character:", characterImg);

    const navigate =useNavigate();
    const handleLogin=()=>{
        navigate("/Login")
    }

    const handleSignup =()=>{
        navigate("/Signup")
    }
  return (
    <div className="container" style={{ backgroundImage: `url(${backgroundImg})` }}>
   
     
   
 
      {/* Logo */}
      <div className="logo-text">DYNA</div>

      {/* Centered Text & Buttons */}
      <div className="centered-content">
        <p className="tagline-text">Ready for new friend</p>
        <div className="buttons-container">
          <button className="action-button" onClick={handleLogin}>LOGIN</button>
          <button className="action-button"   onClick={handleSignup} >SIGN UP</button>
        </div>
      </div>

      {/* Character Image */}
      <img src={characterImg || "/placeholder.svg"} alt="Anime Character" className="character-image" />
    </div>
  )
}


