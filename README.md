# Catapult

A modern, streamlined tool for batch uploading images to Wikimedia Commons. Perfect for uploading loads of images from events, conferences, or photo sessions with consistent metadata and descriptions.

## Features

- 🖼️ **Batch Image Upload** - Upload multiple images at once with drag-and-drop support
- 📝 **Template-based Metadata** - Define reusable templates with variables for consistent image descriptions
- 🔍 **EXIF Data Extraction** - Automatically extract and use metadata from image EXIF data
- 🎨 **Image Preview** - Review images with a carousel viewer before uploading
- 📋 **Variable System** - Define custom variables and context data that can be used across all images
- ✏️ **Individual Customization** - Fine-tune titles and descriptions for each image
- 💾 **Local Storage** - Images and data are stored locally in IndexedDB until upload
- 🔐 **OAuth 2.0 Authentication** - Secure authentication with Wikimedia Commons

## Tech Stack

- **React 19** with TypeScript
- **Vite** for build tooling
- **TanStack Router** for routing
- **Zustand** for state management
- **Tailwind CSS 4** for styling
- **IndexedDB** for local storage
- **exifr** for EXIF data extraction
- **Axios** for API requests

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- A Wikimedia account
- Wikimedia OAuth 2.0 credentials

### Acquiring Wikimedia Credentials

You'll need to register an OAuth 2.0 application on Wikimedia, if you configure it right than you dont even need to wait for approval.

1. Visit the [OAuth Consumer Registration](https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2) page
2. Configure your application with:
   - **Redirect URI**: `http://localhost:5173/Catapult/auth/callback` (for local development)
   - **Grants**:
     - Interact with pages
     - Interact with media
3. then use this provided authentication key as `VITE_ACCESS_TOKEN` in your `.env` file.

For detailed instructions, see [docs/Acquiring-a-WIKIMEDIA-CLIENT-ID.md](docs/Acquiring-a-WIKIMEDIA-CLIENT-ID.md)

### Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd commons-uploader
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root:

   ```env
   VITE_WIKIMEDIA_CLIENT_ID=your_client_id_here
   # Optional: Skip OAuth flow with direct access token
   # VITE_ACCESS_TOKEN=your_access_token_here
   ```

4. Start the development server:

   ```bash
   npm start
   ```

5. Open [http://localhost:5173](http://localhost:5173) in your browser

## Usage

### Workflow

1. **Upload Images** - Drag and drop images or click to select files
2. **Define Variables** - Set up context data and custom variables that can be reused
3. **Configure Template** - Create a title and description template using variables
4. **Fill Out Details** - Complete the template with specific values
5. **Review** - Preview all images with their metadata
6. **Upload** - Authenticate and upload to Wikimedia Commons

### Template System

Catapult features a powerful template system with variable interpolation, EXIF data access, and conditional blocks. Create dynamic, reusable templates that automatically pull in metadata from your images.

📖 **[Full Template Syntax Documentation](docs/template-syntax.md)**

## Available Scripts

- `npm start` / `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint and TypeScript type checking
- `npm run test` - Run tests once

## Project Structure

```
src/
├── components/        # React components
│   ├── tabs/         # Tab components (Upload, Variables, FillOut, Review)
│   └── ...           # Shared components
├── hooks/            # Custom React hooks
├── routes/           # Route components
├── store/            # Zustand state stores
└── utils/            # Utility functions
    ├── exifUtils.ts      # EXIF data extraction
    ├── mediawikiUtils.ts # MediaWiki API helpers
    ├── templateUtils.ts  # Template parsing & rendering
    └── ...
```

## Known Issues

- Images can currently be added multiple times without deduplication

## Contributing

Contributions are welcome! Please ensure:

- Code follows the project's TypeScript and ESLint configuration
- New features include appropriate tests
- All tests pass (`npm run test`)
- Code is linted (`npm run lint`)

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built for the Wikimedia Commons community to simplify batch uploads while maintaining metadata quality.
