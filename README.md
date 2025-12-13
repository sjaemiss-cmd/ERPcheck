# Operation Master (Electron Migration)

This project is a migration of the Python "Operation Master" application to a modern Electron + React stack.

## Tech Stack

- **Core**: Electron, Node.js, TypeScript
- **Frontend**: React, Vite, Tailwind CSS, Shadcn/UI
- **Automation**: Playwright (Node.js)
- **Scheduler**: FullCalendar React

## Project Structure

- `electron/`: Main process code
  - `main.ts`: Entry point, window creation, IPC handlers
  - `preload.ts`: Context bridge for IPC
  - `services/erpService.ts`: Playwright logic for ERP automation
- `src/`: Renderer process code (React)
  - `App.tsx`: Main application layout
  - `components/`: React components (Scheduler, etc.)
  - `lib/`: Utilities

## Setup & Run

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Run in Development Mode**:
    ```bash
    npm run dev
    ```
    This will start the Vite dev server and launch the Electron window.

3.  **Build for Production**:
    ```bash
    npm run build
    ```

## Key Features Implemented

- **IPC Communication**: Secure communication between React and Electron using `contextBridge`.
- **Network Interception**: Playwright captures raw JSON responses from the ERP server for faster data loading, bypassing DOM parsing.
- **Headless Toggle**: Toggle Playwright's headless mode directly from the UI.
- **Modern Scheduler**: FullCalendar integration for a responsive and interactive schedule view.

## Next Steps

- **ERP Credentials**: Implement secure storage for ERP ID/Password (currently placeholders in `App.tsx`).
- **Real API Endpoints**: Update `erpService.ts` with the actual ERP URLs and selectors.
- **Naver/Kakao Integration**: Port the Naver/Kakao logic to Node.js services similar to `erpService.ts`.
