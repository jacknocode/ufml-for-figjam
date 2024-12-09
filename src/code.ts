// Types
interface ScreenElement {
  type: 'screen' | 'requirement' | 'component' | 'usecase';
  name: string;
  requirements?: {
    performance?: string;
    security?: string;
    availability?: string;
    usability?: string;
  };
  components?: {
    type: 'text' | 'field' | 'button' | 'action';
    name: string;
  }[];
  transitions?: {
    to: string;
    condition?: string;
  }[];
}

// Parser
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
          requirements: {},
          components: [],
          transitions: [],
        };
      } else if (line.startsWith('//')) {
        const [type, ...description] = line.slice(2).split(':');
        if (this.currentScreen && this.currentScreen.requirements) {
          switch (type.trim()) {
            case 'P':
              this.currentScreen.requirements.performance = description.join(':').trim();
              break;
            case 'S':
              this.currentScreen.requirements.security = description.join(':').trim();
              break;
            case 'A':
              this.currentScreen.requirements.availability = description.join(':').trim();
              break;
            case 'U':
              this.currentScreen.requirements.usability = description.join(':').trim();
              break;
          }
        }
      } else if (
        line.startsWith('T ') ||
        line.startsWith('E ') ||
        line.startsWith('B ') ||
        line.startsWith('A ')
      ) {
        const type = line[0];
        const name = line.slice(2);
        if (this.currentScreen) {
          this.currentScreen.components!.push({
            type:
              type === 'T' ? 'text' : type === 'E' ? 'field' : type === 'B' ? 'button' : 'action',
            name,
          });
        }
      } else if (line.startsWith('=>')) {
        if (this.currentScreen) {
          this.currentScreen.transitions!.push({
            to: line.slice(2).trim(),
          });
        }
      } else if (line.startsWith('={')) {
        const match = line.match(/={(.+)}=>(.+)/);
        if (match && this.currentScreen) {
          this.currentScreen.transitions!.push({
            to: match[2].trim(),
            condition: match[1].trim(),
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
  private spacing = 150;

  constructor(private figma: PluginAPI) {}

  async render(screens: ScreenElement[]) {
    try {
      // 先にフォントを読み込む
      await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

      const screenNodes = new Map<string, StickyNode>();
      const startX = 0;
      const startY = 0;

      // First pass: Create all screen nodes
      for (let i = 0; i < screens.length; i++) {
        const screen = screens[i];
        const node = await this.createScreenNode(screen, startX + i * this.spacing * 2, startY);
        screenNodes.set(screen.name, node);
      }
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

          if (transition.condition) {
            const text = this.figma.createText();
            await figma.loadFontAsync({ family: 'Space Mono', style: 'Regular' });
            text.characters = transition.condition;
            text.fontSize = 12;
            const midX = (sourceNode.x + targetNode.x) / 2;
            const midY = (sourceNode.y + targetNode.y) / 2;
            text.x = midX;
            text.y = midY - 20;
          }
        }
      }
    } catch (error) {
      console.error('Render error:', error);
      throw error;
    }
  }

  private async createScreenNode(screen: ScreenElement, x: number, y: number): Promise<StickyNode> {
    try {
      console.log('Creating screen node:', screen);

      const node = this.figma.createSticky();
      node.x = x;
      node.y = y;

      await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

      let content = `[${screen.name}]\n\n`;

      if (screen.requirements) {
        if (screen.requirements.performance) {
          content += `P: ${screen.requirements.performance}\n`;
        }
        if (screen.requirements.security) {
          content += `S: ${screen.requirements.security}\n`;
        }
        if (screen.requirements.availability) {
          content += `A: ${screen.requirements.availability}\n`;
        }
        if (screen.requirements.usability) {
          content += `U: ${screen.requirements.usability}\n`;
        }
        content += '\n';
      }

      if (screen.components) {
        for (const component of screen.components) {
          content += `${component.type.toUpperCase()}: ${component.name}\n`;
        }
      }

      console.log('Setting content:', content);
      node.text.characters = content;

      return node;
    } catch (error) {
      console.error('CreateScreenNode error:', error);
      throw error;
    }
  }

  private async createTransitionLabel(text: string, x: number, y: number) {
    const textNode = this.figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    textNode.characters = text;
    textNode.fontSize = 12;
    textNode.x = x;
    textNode.y = y;
    return textNode;
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
