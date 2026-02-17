import { Tool, type ToolInput, type ToolMetadata } from './base';

export class GoogleDocsCreateTool extends Tool {
  metadata: ToolMetadata = {
    name: 'google_docs_create',
    description:
      'Create a Google Doc (optionally in a folder) and write initial content. Requires GOOGLE_ACCESS_TOKEN or GOOGLE_DRIVE_MOCK=true.',
    parameters: [
      {
        name: 'title',
        type: 'string',
        description: 'Document title',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: 'Initial document body text',
        required: false,
      },
      {
        name: 'folder_id',
        type: 'string',
        description: 'Optional Google Drive folder ID (uses GOOGLE_DRIVE_FOLDER_ID if omitted)',
        required: false,
      },
    ],
    category: 'google-workspace',
    compliance_level: 'restricted',
    requires_approval: false,
  };

  async execute(input: ToolInput): Promise<{ documentId: string; url: string }> {
    this.validate(input);

    const title = String(input.title);
    const content = typeof input.content === 'string' ? (input.content as string) : '';
    const folderId = typeof input.folder_id === 'string' ? (input.folder_id as string) : '';

    const mockMode = (process.env.GOOGLE_DRIVE_MOCK || '').toLowerCase() === 'true';
    if (mockMode) {
      const fakeId = `mock_${Date.now().toString(36)}`;
      return {
        documentId: fakeId,
        url: `https://docs.google.com/document/d/${fakeId}/edit`,
      };
    }

    const accessToken = (process.env.GOOGLE_ACCESS_TOKEN || '').trim();
    if (!accessToken) {
      throw new Error('Missing GOOGLE_ACCESS_TOKEN (or set GOOGLE_DRIVE_MOCK=true).');
    }

    const effectiveFolderId = (folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();

    const driveCreateBody: Record<string, unknown> = {
      name: title,
      mimeType: 'application/vnd.google-apps.document',
    };
    if (effectiveFolderId) {
      driveCreateBody.parents = [effectiveFolderId];
    }

    const driveRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(driveCreateBody),
      }
    );

    if (!driveRes.ok) {
      const text = await driveRes.text().catch(() => '');
      throw new Error(`Drive create failed: ${driveRes.status} ${driveRes.statusText} ${text}`);
    }

    const driveJson = (await driveRes.json()) as { id?: string };
    const documentId = driveJson.id;
    if (!documentId) {
      throw new Error('Drive create returned no file id');
    }

    if (content.trim().length > 0) {
      const docsRes = await fetch(
        `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: content,
                },
              },
            ],
          }),
        }
      );

      if (!docsRes.ok) {
        const text = await docsRes.text().catch(() => '');
        throw new Error(`Docs update failed: ${docsRes.status} ${docsRes.statusText} ${text}`);
      }
    }

    return {
      documentId,
      url: `https://docs.google.com/document/d/${documentId}/edit`,
    };
  }
}
