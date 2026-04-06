// Firebase Configuration
// import firebase from "firebase/app";
// import "firebase/firestore";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// import firebase from "firebase/compat/app";
// // Required for side-effects
// import "firebase/firestore";
import firebaseConfig from "./config";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Helper function to create user document in Firestore
async function createUserDocument(user, additionalData = {}) {
    if (!user) return;
    
    const userRef = db.collection('users').doc(user.uid);
    const snapshot = await userRef.get();
    
    if (!snapshot.exists) {
        try {
            const { email, displayName, photoURL } = user;
            const createdAt = new Date();
            
            // Create user document with default structure
            await userRef.set({
                uid: user.uid,
                email,
                displayName: displayName || additionalData.displayName || '',
                photoURL: photoURL || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                settings: {
                    theme: 'light',
                    notifications: true
                },
                stats: {
                    totalForms: 0,
                    totalSubmissions: 0,
                    totalContacts: 0
                }
            });
            
            console.log('User document created successfully');
            
            // Create a default database for the user
            const defaultDbRef = userRef.collection('databases').doc('default_database');
            await defaultDbRef.set({
                name: 'Default Database',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                description: 'Your default database for form submissions',
                isDefault: true,
                schema: [],
                flow: null
            });
            
            console.log('Default database created successfully');
            
        } catch (error) {
            console.error('Error creating user document:', error);
        }
    } else {
        // Update last login
        await userRef.update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    return userRef;
}

// Check if user is already logged in
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Create/update user document in Firestore
        await createUserDocument(user);
        
        // User is logged in, redirect to dashboard if on login/register page
        if (window.location.pathname.includes('login.html') || 
            window.location.pathname.includes('register.html')) {
            window.location.href = 'dashboard.html';
        }
    } else {
        // User is not logged in, redirect to landing if on dashboard
        if (window.location.pathname.includes('dashboard.html')) {
            window.location.href = 'index.html';
        }
    }
});

// Login Form Handler
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const submitBtn = document.querySelector('#loginForm button[type="submit"]');
        const spinner = submitBtn.querySelector('.fa-spinner');
        
        // Show loading
        spinner.classList.remove('d-none');
        submitBtn.disabled = true;
        
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            
            // Update user document with last login
            await createUserDocument(userCredential.user);
            
            showSuccess('Login successful! Redirecting...');
            
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
            
        } catch (error) {
            let errorMessage = 'Login failed. ';
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage += 'No user found with this email.';
                    break;
                case 'auth/wrong-password':
                    errorMessage += 'Incorrect password.';
                    break;
                case 'auth/invalid-email':
                    errorMessage += 'Invalid email address.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage += 'Too many failed attempts. Please try again later.';
                    break;
                default:
                    errorMessage += error.message;
            }
            showError(errorMessage);
            console.error('Login error:', error);
        } finally {
            // Hide loading
            spinner.classList.add('d-none');
            submitBtn.disabled = false;
        }
    });
}

// Register Form Handler
if (document.getElementById('registerForm')) {
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const submitBtn = document.querySelector('#registerForm button[type="submit"]');
        const spinner = submitBtn.querySelector('.fa-spinner');
        
        // Validate passwords match
        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }
        
        // Validate password length
        if (password.length < 6) {
            showError('Password must be at least 6 characters');
            return;
        }
        
        // Show loading
        spinner.classList.remove('d-none');
        submitBtn.disabled = true;
        
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            
            // Update profile with name
            await userCredential.user.updateProfile({
                displayName: name
            });
            
            // Create user document in Firestore with additional data
            await createUserDocument(userCredential.user, { displayName: name });
            
            showSuccess('Account created successfully! Redirecting...');
            
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
            
        } catch (error) {
            let errorMessage = 'Registration failed. ';
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage += 'Email already in use.';
                    break;
                case 'auth/invalid-email':
                    errorMessage += 'Invalid email address.';
                    break;
                case 'auth/weak-password':
                    errorMessage += 'Password is too weak.';
                    break;
                default:
                    errorMessage += error.message;
            }
            showError(errorMessage);
            console.error('Registration error:', error.message);
        } finally {
            // Hide loading
            spinner.classList.add('d-none');
            submitBtn.disabled = false;
        }
    });
}

// Google Login/Register Handler (combined)
if (document.getElementById('googleLogin') || document.getElementById('googleRegister')) {
    const googleButtons = ['googleLogin', 'googleRegister'];
    
    googleButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', async () => {
                const provider = new firebase.auth.GoogleAuthProvider();
                const originalText = button.innerHTML;
                
                // Show loading
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
                button.disabled = true;
                
                try {
                    const result = await auth.signInWithPopup(provider);
                    
                    // Create user document in Firestore
                    await createUserDocument(result.user);
                    
                    const message = result.additionalUserInfo.isNewUser ? 
                        'Registration successful! Redirecting...' : 
                        'Login successful! Redirecting...';
                    
                    showSuccess(message);
                    
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1500);
                    
                } catch (error) {
                    showError('Google authentication failed: ' + error.message);
                    button.innerHTML = originalText;
                    button.disabled = false;
                }
            });
        }
    });
}

// Modal Functions
function showError(message) {
    const errorModal = document.getElementById('errorModal');
    const errorMessage = document.getElementById('errorMessage');
    if (errorModal && errorMessage) {
        errorMessage.textContent = message;
        errorModal.classList.add('active');
    }
}

function showSuccess(message) {
    const successModal = document.getElementById('successModal');
    const successMessage = document.getElementById('successMessage');
    if (successModal && successMessage) {
        successMessage.textContent = message;
        successModal.classList.add('active');
    }
}

// Close modals
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    });
});

// Close modals on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});