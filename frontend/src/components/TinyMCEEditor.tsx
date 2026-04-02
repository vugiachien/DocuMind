import React from 'react';
import { Editor } from '@tinymce/tinymce-react';

interface TinyMCEEditorProps {
    value: string;
    onChange: (content: string) => void;
    onInit?: (evt: any, editor: any) => void;
    disabled?: boolean;
    height?: number | string;
    minimal?: boolean;
}

const TinyMCEEditorInner: React.FC<TinyMCEEditorProps> = ({
    value,
    onChange,
    onInit,
    disabled = false,
    minimal = false,
    height = '100%'
}) => {
    // A4 Paper Style (Default)
    const a4Style = `
        body { 
            font-family: "Times New Roman", Times, serif; 
            font-size: 12pt; 
            line-height: 1.5; 
            max-width: 210mm;
            margin: 0 auto; 
            padding: 20mm;
            background: #fff;
            box-shadow: 0 0 10px rgba(0,0,0,0.1); 
            min-height: 297mm;
        }
        p { margin: 0; }
        html {
            background: #f0f2f5; 
            padding: 20px;
        }
    `;

    // Minimal Style (For Modals)
    const minimalStyle = `
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            margin: 0;
            padding: 12px;
            background: #fff;
        }
        p { margin: 0; margin-bottom: 8px; }
    `;

    return (
        <Editor
            tinymceScriptSrc='/tinymce/tinymce.min.js'
            licenseKey='gpl'
            // Use initialValue (uncontrolled) so TinyMCE manages its own state internally.
            // Passing `value` (controlled) causes the editor to re-sync on every keystroke
            // which resets the cursor position to the beginning.
            initialValue={value}
            onEditorChange={(content: string, _editor: any) => onChange(content)}
            onInit={onInit}
            disabled={disabled}
            init={{
                promotion: false,
                height: height,
                menubar: !minimal,
                plugins: [
                    'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                    'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                    'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount'
                ],
                toolbar: minimal
                    ? 'undo redo | bold italic | bullist numlist | removeformat'
                    : 'undo redo | blocks | bold italic forecolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | help',
                content_style: minimal ? minimalStyle : a4Style,
                branding: false,
                statusbar: !minimal,
                resize: !minimal
            }}
        />
    );
};

// Wrap in React.memo with a custom equality check.
//
// Root cause of the cursor-jump bug:
//   1. User types a character → onChange fires → setEditedText(content) in parent
//   2. Parent re-renders → new `value` prop passed to TinyMCEEditor
//   3. Without memo, React unmounts + remounts the Editor → initialValue resets → cursor jumps
//
// Fix: only allow re-mount when structural props (height / minimal / disabled) actually change.
// Value changes after init are ignored because the editor is uncontrolled.
const TinyMCEEditor = React.memo(
    TinyMCEEditorInner,
    (prev, next) =>
        prev.height === next.height &&
        prev.minimal === next.minimal &&
        prev.disabled === next.disabled
);

export default TinyMCEEditor;
