# Agenda Dr. Melo

Agenda Dr. Melo is a Next.js application for managing patient appointments, featuring AI-powered observation categorization and Firebase integration.

This application allows users to:
- Input patient and appointment details through an interactive form.
- Validate data to ensure correctness.
- Save appointment information to Firebase Realtime Database.
- View scheduled appointments on an interactive calendar.
- Automatically categorize patient observations using a Genkit AI flow to assist in triage and care planning.

## Getting Started

This is a Next.js project bootstrapped with `create-next-app` and enhanced for Firebase Studio.

### Prerequisites

- Node.js (version 18.x or later recommended)
- npm or yarn
- Firebase project (ensure you have your Firebase project configuration details)

### Firebase Setup

1.  Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/).
2.  Enable Firebase Realtime Database for your project.
3.  In your Firebase project settings, find your Web app configuration (API key, authDomain, databaseURL, etc.).
4.  Update the Firebase configuration in `src/lib/firebase.ts` with your project's details. You can use environment variables for this:
    *   `NEXT_PUBLIC_FIREBASE_API_KEY`
    *   `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
    *   `NEXT_PUBLIC_FIREBASE_DATABASE_URL` (e.g., `https://your-project-id-default-rtdb.firebaseio.com`)
    *   `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
    *   `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
    *   `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
    *   `NEXT_PUBLIC_FIREBASE_APP_ID`
    Create a `.env.local` file in the root of your project and add these variables.

### Running the Development Server

First, install the dependencies:
```bash
npm install
# or
yarn install
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:9002](http://localhost:9002) (or the port specified in your `package.json` scripts) with your browser to see the application.

The main application page is `src/app/page.tsx`.

### Genkit AI Flow

The AI functionality for categorizing patient observations is located in `src/ai/flows/categorize-patient-observations.ts`. To run Genkit locally for development or testing of AI flows (if needed, though this app uses it as a serverless function):

```bash
npm run genkit:dev
# or for watching changes
npm run genkit:watch
```

## Project Structure

-   `src/app/`: Contains the main application pages, layout, global styles, and server actions.
-   `src/components/`: Reusable UI components, including ShadCN UI components and custom application components like `PatientForm` and `AppointmentCalendar`.
-   `src/lib/`: Utility functions, including Firebase setup (`firebase.ts`).
-   `src/types/`: TypeScript type definitions for the application, e.g., `patient.ts`.
-   `src/ai/`: Contains Genkit AI flows. **Do not modify files in this directory unless you are familiar with the Genkit setup.**

## Core Features

-   **Patient Data Entry**: Interactive form for all necessary patient and appointment information.
-   **Data Validation**: Client-side validation using Zod.
-   **Firebase Integration**: Securely saves data to Firebase Realtime Database under the path `DRM/agendamentoWhatsApp/operacional/consultasAgendadas/unidades/{local}/{appointmentId}` and `DRM/agendamentoWhatsApp/operacional/consultasAgendadas/telefones/{telefone}/{appointmentId}`.
-   **Appointment Visualization**: An interactive calendar displays booked appointments, allowing users to see details for selected dates.
-   **AI Observation Categorization**: Uses a Genkit AI flow to categorize patient observations, aiding in efficient patient management.

## Customization

-   **Styling**: Modify `src/app/globals.css` and Tailwind configuration (`tailwind.config.ts`) for theme changes.
-   **Firebase Path**: The Firebase save path is defined in `src/app/actions.ts`.
-   **Form Fields**: Adjust `src/types/patient.ts` (Zod schema) and `src/components/patient-form.tsx` to change form fields.
