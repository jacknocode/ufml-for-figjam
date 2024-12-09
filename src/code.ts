interface ScreenElement {
  type: 'screen';
  name: string;
  components: {
    type: 'text' | 'button' | 'action' | 'other'; // 'other' を追加
    name: string;
  }[];
  transitions: {
    from: string; // アクション名
    to: string; // 遷移先画面名
  }[];
  sections: string[]; // セクション区切りを保持
}

class ScreenFlowParser {
  private screens: ScreenElement[] = [];
  private currentScreen: ScreenElement | null = null;

  parse(text: string): ScreenElement[] {
    this.screens = [];
    this.currentScreen = null;

    const lines = text.split('\n').map((line) => line.trim());

    for (const line of lines) {
      if (line === '') continue;

      if (line.startsWith('[') && line.endsWith(']')) {
        if (this.currentScreen) {
          this.screens.push(this.currentScreen);
        }
        this.currentScreen = {
          type: 'screen',
          name: line.slice(1, -1),
          components: [],
          transitions: [],
          sections: [],
        };
      } else if (line === '--') {
        // セクション区切りを追加
        if (this.currentScreen) {
          this.currentScreen.sections.push(line);
        }
      } else if (line.includes('=>')) {
        // 画面遷移の処理
        if (this.currentScreen) {
          const [action, target] = line.split('=>').map((s) => s.trim());
          const actionName = action.slice(2); // 'A ' を除去
          this.currentScreen.transitions.push({
            from: actionName,
            to: target,
          });
          // アクションも通常のコンポーネントとして追加
          this.currentScreen.components.push({
            type: 'action',
            name: actionName,
          });
        }
      } else if (
        line.startsWith('T ') ||
        line.startsWith('B ') ||
        line.startsWith('A ') ||
        line.startsWith('O ')
      ) {
        if (this.currentScreen) {
          const type = line[0];
          const name = line.slice(2);
          this.currentScreen.components.push({
            type:
              type === 'T' ? 'text' : type === 'B' ? 'button' : type === 'A' ? 'action' : 'other',
            name: name,
          });
        }
      }
    }

    if (this.currentScreen) {
      this.screens.push(this.currentScreen);
    }

    return this.screens;
  }
}

// Renderer
class ScreenFlowRenderer {
  private spacing = 300;

  constructor(private figma: PluginAPI) {}

  private async createScreenNode(screen: ScreenElement, x: number, y: number): Promise<FrameNode> {
    // フレームを作成
    const frame = this.figma.createFrame();
    frame.x = x;
    frame.y = y;
    frame.resize(250, 300);

    // フレームのスタイル設定
    frame.fills = [
      {
        type: 'SOLID',
        color: { r: 1, g: 1, b: 1 }, // 白背景
        opacity: 1,
      },
    ];

    // テキストノードを作成
    const textNode = this.figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

    let content = `[${screen.name}]\n\n`;

    for (const component of screen.components) {
      if (
        screen.sections.includes('--') &&
        component.type === 'action' &&
        !content.endsWith('\n\n')
      ) {
        content += '\n';
      }

      content += `${this.getComponentPrefix(component.type)}: ${component.name}\n`;
    }

    textNode.characters = content;
    textNode.fontSize = 12;

    // テキストをフレームに追加
    frame.appendChild(textNode);

    // テキストの位置調整
    textNode.x = 16;
    textNode.y = 16;

    return frame;
  }

  private getComponentPrefix(type: string): string {
    switch (type) {
      case 'text':
        return 'T';
      case 'button':
        return 'B';
      case 'action':
        return 'A';
      case 'other':
        return 'O';
      default:
        return '?';
    }
  }

  async render(screens: ScreenElement[]) {
    try {
      await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

      const screenNodes = new Map<string, FrameNode>();
      const startX = 100;
      const startY = 100;

      // First pass: Create all screen nodes
      for (let i = 0; i < screens.length; i++) {
        const screen = screens[i];
        const node = await this.createScreenNode(screen, startX + i * this.spacing, startY);
        screenNodes.set(screen.name, node);
      }

      // Second pass: Create connections
      for (const screen of screens) {
        const sourceNode = screenNodes.get(screen.name);
        if (!sourceNode || !screen.transitions) continue;

        for (const transition of screen.transitions) {
          const targetNode = screenNodes.get(transition.to);
          if (!targetNode) continue;

          const connector = this.figma.createConnector();
          connector.strokeWeight = 2;
          connector.connectorStart = {
            endpointNodeId: sourceNode.id,
            magnet: 'AUTO',
          };
          connector.connectorEnd = {
            endpointNodeId: targetNode.id,
            magnet: 'AUTO',
          };

          // 遷移ラベルを作成
          const label = this.figma.createText();
          await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
          label.characters = transition.from;
          label.fontSize = 10;

          const midX = (sourceNode.x + targetNode.x) / 2;
          const midY = (sourceNode.y + targetNode.y) / 2;
          label.x = midX - label.width / 2;
          label.y = midY - 15;
        }
      }
    } catch (error) {
      console.error('Render error:', error);
      throw error;
    }
  }
}

// Main
figma.showUI(__html__, {
  width: 450,
  height: 550,
  title: 'Screen Flow Generator',
});

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'create-flow') {
    try {
      console.log('Received text:', msg.text);

      const parser = new ScreenFlowParser();
      const renderer = new ScreenFlowRenderer(figma);

      const screens = parser.parse(msg.text);
      console.log('Parsed screens:', screens);

      await renderer.render(screens);

      figma.notify('Screen flow generated successfully!');
    } catch (err) {
      console.error('Error:', err);
      const error = err as Error;
      figma.notify('Error generating screen flow: ' + (error.message || 'Unknown error'), {
        error: true,
      });
    }
  }
};
