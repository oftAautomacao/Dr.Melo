import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

// Mock config for debug (replace with real or load from env if possible)
import fs from 'fs';
import path from 'path';

// I need to use the actual Firebase connection to query. I'll load the firebaseConfig from the project.
// But it's easier to just use the admin SDK if available or the web SDK with dotenv.
// Let's just create a simpler script using `dotenv` and the project's `ambiente.ts`
