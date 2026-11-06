import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDTczdXGzMRSoCCK9yGbWE4zPYlGSJAJdA",
  authDomain: "plataforma-servicos-47974.firebaseapp.com",
  projectId: "plataforma-servicos-47974",
  storageBucket: "plataforma-servicos-47974.firebasestorage.app",
  messagingSenderId: "1022643984338",
  appId: "1:1022643984338:web:e65ec4459e6fb008d81a0b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);