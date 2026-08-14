const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Add var declarations
content = content.replace(
  "const checkAdminAndSetup = async () => {",
  "let localInterval: NodeJS.Timeout;\n    let serverInterval: NodeJS.Timeout;\n    const checkAdminAndSetup = async () => {"
);

// Remove the inner return
content = content.replace(
  `          return () => {
            clearInterval(localInterval);
            clearInterval(serverInterval);
          };
        }
      };
      checkAdminAndSetup();
    }, [isAuthenticated]);`,
  `        }
      };
      checkAdminAndSetup();
      
      return () => {
        if (localInterval) clearInterval(localInterval);
        if (serverInterval) clearInterval(serverInterval);
      };
    }, [isAuthenticated]);`
);

fs.writeFileSync('src/App.tsx', content);
