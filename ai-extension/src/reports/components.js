/**
 * Report Component Library
 * Granular, reusable components for dynamic report composition
 */

export const ReportComponents = {
  // ============ HERO COMPONENTS ============
  hero: {
    render(data) {
      const hero = document.createElement('div');
      hero.className = 'report-hero report-hero-responsive';

      // Background with dark overlay for good text contrast
      const randomImageUrl = `https://picsum.photos/1920/500?random=${Date.now()}`;
      const backgroundStyle = data.backgroundImage
        ? `linear-gradient(rgba(0,0,0,0.75), rgba(0,0,0,0.85)), url('${data.backgroundImage}')`
        : `linear-gradient(rgba(0,0,0,0.75), rgba(0,0,0,0.85)), url('${randomImageUrl}')`;

      hero.style.cssText = `
        position: relative;
        min-height: 500px;
        background: ${backgroundStyle};
        background-size: cover;
        background-position: center;
        color: white;
        padding: 60px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        margin-left: 0;
        width: 100%;
        transition: margin-left 0.3s ease;
      `;

      // Top bar with pocket name and download button
      const topBar = document.createElement('div');
      topBar.style.cssText = `
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: auto;
      `;

      if (data.pocketName) {
        const pocketContainer = document.createElement('div');
        pocketContainer.style.cssText = 'display: flex; align-items: center; gap: 16px;';
        pocketContainer.appendChild(this.pocketBadge.render(data.pocketName));
        
        // Download button
        const downloadBtn = document.createElement('button');
        downloadBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_1_19358)"><path d="M7 12L12 17M12 17L17 12M12 17L12 4" stroke="#292929" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 20H18" stroke="#292929" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g><defs><clipPath id="clip0_1_19358"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>`;
        downloadBtn.title = 'Download Report as PDF';
        downloadBtn.style.cssText = `
          width: 48px;
          height: 48px;
          background: rgba(255,255,255,0.95);
          border: none;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        downloadBtn.onmouseenter = () => {
          downloadBtn.style.background = 'rgba(255,255,255,1)';
          downloadBtn.style.transform = 'scale(1.05)';
        };
        downloadBtn.onmouseleave = () => {
          downloadBtn.style.background = 'rgba(255,255,255,0.95)';
          downloadBtn.style.transform = 'scale(1)';
        };
        downloadBtn.onclick = () => {
          const sidebar = document.getElementById('reportSidebar');
          const expandBtn = document.getElementById('sidebarExpandBtn');
          const mainContent = document.getElementById('reportMainContent');
          
          const sidebarDisplay = sidebar?.style.display || '';
          const expandBtnDisplay = expandBtn?.style.display || '';
          const mainMargin = mainContent?.style.marginLeft || '';
          
          if (sidebar) sidebar.style.display = 'none';
          if (expandBtn) expandBtn.style.display = 'none';
          if (mainContent) mainContent.style.marginLeft = '0';
          
          const printStyle = document.createElement('style');
          printStyle.id = 'print-styles';
          printStyle.textContent = `
            @media print {
              body { background: white !important; }
              .report-sidebar { display: none !important; }
              #sidebarExpandBtn { display: none !important; }
              #reportMainContent { margin-left: 0 !important; }
            }
          `;
          document.head.appendChild(printStyle);
          
          setTimeout(() => {
            window.print();
            setTimeout(() => {
              if (sidebar) sidebar.style.display = sidebarDisplay;
              if (expandBtn) expandBtn.style.display = expandBtnDisplay;
              if (mainContent) mainContent.style.marginLeft = mainMargin;
              const printStyleEl = document.getElementById('print-styles');
              if (printStyleEl) printStyleEl.remove();
            }, 100);
          }, 100);
        };
        pocketContainer.appendChild(downloadBtn);
        topBar.appendChild(pocketContainer);
      }

      hero.appendChild(topBar);

      // Content section at bottom
      const contentSection = document.createElement('div');
      contentSection.style.cssText = 'margin-top: auto;';
      
      if (data.title) {
        contentSection.appendChild(this.title.render(data.title));
      }
      if (data.subtitle) {
        contentSection.appendChild(this.subtitle.render(data.subtitle));
      }

      hero.appendChild(contentSection);
      return hero;
    },

    pocketBadge: {
      render(name) {
        const badge = document.createElement('div');
        badge.className = 'pocket-badge';
        badge.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 12px;
          background: rgba(255,255,255,0.95);
          backdrop-filter: blur(10px);
          padding: 14px 28px;
          border-radius: 30px;
          font-size: 16px;
          font-weight: 500;
          color: #1a1a1a;
          width: fit-content;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        badge.innerHTML = `<span style="font-size: 18px;">📁</span><span>${name}</span>`;
        return badge;
      }
    },

    title: {
      render(text) {
        const title = document.createElement('h1');
        title.style.cssText = `
          font-size: 64px;
          font-weight: 700;
          margin: 0 0 24px 0;
          line-height: 1.1;
          max-width: 75%;
          letter-spacing: -0.01em;
          text-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        `;
        title.textContent = text;
        return title;
      }
    },

    subtitle: {
      render(text) {
        const subtitle = document.createElement('p');
        subtitle.style.cssText = `
          font-size: 16px;
          line-height: 1.7;
          margin: 0;
          max-width: 75%;
          opacity: 0.9;
          color: rgba(255,255,255,0.95);
          text-shadow: 0 1px 4px rgba(0,0,0,0.2);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        `;
        subtitle.textContent = text;
        return subtitle;
      }
    }
  },

  // ============ SIDEBAR COMPONENTS ============
  sidebar: {
    render(data) {
      const sidebar = document.createElement('div');
      sidebar.className = 'report-sidebar';
      sidebar.id = 'reportSidebar';
      sidebar.style.cssText = `
        position: absolute;
        left: 0;
        top: 500px;
        width: 280px;
        min-height: calc(100vh - 500px);
        background: #0f0f0f;
        color: white;
        padding: 24px;
        overflow-y: auto;
        transition: transform 0.3s ease;
        z-index: 1000;
        border-right: 1px solid rgba(255,255,255,0.05);
      `;

      // Collapse button
      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'sidebar-collapse';
      collapseBtn.innerHTML = '☰ collapse sidebar';
      collapseBtn.style.cssText = `
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.7);
        padding: 10px 16px;
        border-radius: 6px;
        cursor: pointer;
        width: 100%;
        margin-bottom: 24px;
        font-size: 13px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      collapseBtn.onmouseenter = () => {
        collapseBtn.style.background = 'rgba(255,255,255,0.08)';
        collapseBtn.style.color = 'white';
      };
      collapseBtn.onmouseleave = () => {
        collapseBtn.style.background = 'rgba(255,255,255,0.05)';
        collapseBtn.style.color = 'rgba(255,255,255,0.7)';
      };
      collapseBtn.onclick = () => {
        const isCollapsed = sidebar.style.transform === 'translateX(-280px)';
        sidebar.style.transform = isCollapsed ? 'translateX(0)' : 'translateX(-280px)';
        
        // Toggle expand button visibility
        const expandBtn = document.getElementById('sidebarExpandBtn');
        if (expandBtn) {
          expandBtn.style.display = isCollapsed ? 'none' : 'flex';
        }
        
        // Adjust main content with collapsed class
        const mainContent = document.getElementById('reportMainContent');
        
        if (isCollapsed) {
          // Expanding sidebar
          if (mainContent) {
            mainContent.classList.remove('sidebar-collapsed');
            mainContent.style.marginLeft = '280px';
          }
        } else {
          // Collapsing sidebar
          if (mainContent) {
            mainContent.classList.add('sidebar-collapsed');
            mainContent.style.marginLeft = '0';
          }
        }
      };
      sidebar.appendChild(collapseBtn);

      // Text size controls
      if (data.showTextSize) {
        sidebar.appendChild(this.textSizeControl.render());
      }

      // Theme selector
      sidebar.appendChild(this.themeControl.render());

      // Index
      if (data.index) {
        sidebar.appendChild(this.index.render(data.index));
      }

      // Create expand button (initially hidden)
      const expandBtn = document.createElement('button');
      expandBtn.id = 'sidebarExpandBtn';
      expandBtn.innerHTML = '☰';
      expandBtn.style.cssText = `
        position: absolute;
        left: 20px;
        top: 520px;
        width: 48px;
        height: 48px;
        background: rgba(255,255,255,0.1);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
        border-radius: 8px;
        cursor: pointer;
        font-size: 20px;
        z-index: 999;
        display: none;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      `;
      expandBtn.onmouseenter = () => {
        expandBtn.style.background = 'rgba(255,255,255,0.15)';
        expandBtn.style.transform = 'scale(1.05)';
      };
      expandBtn.onmouseleave = () => {
        expandBtn.style.background = 'rgba(255,255,255,0.1)';
        expandBtn.style.transform = 'scale(1)';
      };
      expandBtn.onclick = () => {
        sidebar.style.transform = 'translateX(0)';
        expandBtn.style.display = 'none';
        
        // Adjust main content - remove collapsed class
        const mainContent = document.getElementById('reportMainContent');
        if (mainContent) {
          mainContent.classList.remove('sidebar-collapsed');
          mainContent.style.marginLeft = '280px';
        }
      };
      document.body.appendChild(expandBtn);

      return sidebar;
    },

    textSizeControl: {
      render() {
        const control = document.createElement('div');
        control.style.cssText = 'margin-bottom: 24px;';
        control.innerHTML = `
          <div style="font-size: 11px; margin-bottom: 12px; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.5px;">text size</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="text-size-decrease" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 16px; transition: all 0.2s; display: flex; align-items: center; justify-content: center;">◀</button>
            <span class="text-size-value" style="color: rgba(255,255,255,0.9); font-size: 14px; min-width: 30px; text-align: center;">16</span>
            <button class="text-size-increase" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 16px; transition: all 0.2s; display: flex; align-items: center; justify-content: center;">▶</button>
          </div>
        `;

        // Add event listeners
        setTimeout(() => {
          let currentSize = 16;
          const valueDisplay = control.querySelector('.text-size-value');
          const decreaseBtn = control.querySelector('.text-size-decrease');
          const increaseBtn = control.querySelector('.text-size-increase');
          
          const updateSize = (newSize) => {
            currentSize = Math.max(12, Math.min(22, newSize));
            valueDisplay.textContent = currentSize;
            const content = document.getElementById('reportMainContent');
            if (content) {
              // Update all text elements in the report
              content.style.fontSize = `${currentSize}px`;
              
              // Update paragraphs
              const paragraphs = content.querySelectorAll('p');
              paragraphs.forEach(p => {
                p.style.fontSize = `${currentSize}px`;
              });
              
              // Update list items
              const listItems = content.querySelectorAll('li');
              listItems.forEach(li => {
                li.style.fontSize = `${currentSize}px`;
              });
              
              // Scale headings proportionally
              const h2s = content.querySelectorAll('h2');
              h2s.forEach(h2 => {
                h2.style.fontSize = `${currentSize * 2}px`;
              });
              
              const h3s = content.querySelectorAll('h3');
              h3s.forEach(h3 => {
                h3.style.fontSize = `${currentSize * 1.5}px`;
              });
              
              const h4s = content.querySelectorAll('h4');
              h4s.forEach(h4 => {
                h4.style.fontSize = `${currentSize}px`;
              });
            }
          };

          decreaseBtn.onmouseenter = () => decreaseBtn.style.background = 'rgba(255,255,255,0.08)';
          decreaseBtn.onmouseleave = () => decreaseBtn.style.background = 'rgba(255,255,255,0.05)';
          decreaseBtn.onclick = () => updateSize(currentSize - 1);

          increaseBtn.onmouseenter = () => increaseBtn.style.background = 'rgba(255,255,255,0.08)';
          increaseBtn.onmouseleave = () => increaseBtn.style.background = 'rgba(255,255,255,0.05)';
          increaseBtn.onclick = () => updateSize(currentSize + 1);
        }, 0);

        return control;
      }
    },

    themeControl: {
      render() {
        const control = document.createElement('div');
        control.style.cssText = 'margin-bottom: 32px;';
        control.innerHTML = `
          <div style="font-size: 11px; margin-bottom: 12px; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.5px;">theme</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="theme-prev" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 16px; transition: all 0.2s; display: flex; align-items: center; justify-content: center;">◀</button>
            <span class="theme-value" style="color: rgba(255,255,255,0.9); font-size: 14px; flex: 1; text-align: center;">dark</span>
            <button class="theme-next" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 16px; transition: all 0.2s; display: flex; align-items: center; justify-content: center;">▶</button>
          </div>
        `;

        // Add event listeners
        setTimeout(() => {
          const themes = ['dark', 'light'];
          let currentThemeIndex = 0; // Start with dark theme
          const valueDisplay = control.querySelector('.theme-value');
          const prevBtn = control.querySelector('.theme-prev');
          const nextBtn = control.querySelector('.theme-next');
          
          const applyTheme = (themeName) => {
            const container = document.getElementById('reportContainer');
            const body = document.body;
            const mainContent = document.getElementById('reportMainContent');
            const sidebar = document.getElementById('reportSidebar');
            const hero = document.querySelector('.report-hero');
            
            if (themeName === 'dark') {
              // Dark theme
              if (container) container.style.background = '#0a0a0a';
              if (body) {
                body.style.background = '#0a0a0a';
                body.style.color = 'rgba(255,255,255,0.9)';
              }
              if (mainContent) mainContent.style.color = 'rgba(255,255,255,0.9)';
              if (sidebar) {
                sidebar.style.background = '#0f0f0f';
                sidebar.style.borderRight = '1px solid rgba(255,255,255,0.05)';
              }
              
              // Update all text elements
              const allText = document.querySelectorAll('p, li, h2, h3, h4, span');
              allText.forEach(el => {
                if (el.closest('.report-section')) {
                  if (el.tagName === 'P' || el.tagName === 'LI') {
                    el.style.color = 'rgba(255,255,255,0.7)';
                  } else if (el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'H4') {
                    el.style.color = 'rgba(255,255,255,0.95)';
                  }
                }
              });
              
              // Update sidebar controls
              const sidebarControls = sidebar?.querySelectorAll('button, .theme-value, .text-size-value');
              sidebarControls?.forEach(el => {
                if (el.classList.contains('theme-value') || el.classList.contains('text-size-value')) {
                  el.style.color = 'rgba(255,255,255,0.9)';
                } else if (el.tagName === 'BUTTON') {
                  el.style.background = 'rgba(255,255,255,0.05)';
                  el.style.borderColor = 'rgba(255,255,255,0.1)';
                  el.style.color = 'rgba(255,255,255,0.7)';
                }
              });
              
            } else if (themeName === 'light') {
              // Light theme
              if (container) container.style.background = '#ffffff';
              if (body) {
                body.style.background = '#ffffff';
                body.style.color = '#1a1a1a';
              }
              if (mainContent) mainContent.style.color = '#1a1a1a';
              if (sidebar) {
                sidebar.style.background = '#f5f5f5';
                sidebar.style.borderRight = '1px solid rgba(0,0,0,0.1)';
              }
              
              // Update all text elements
              const allText = document.querySelectorAll('p, li, h2, h3, h4, span');
              allText.forEach(el => {
                if (el.closest('.report-section')) {
                  if (el.tagName === 'P' || el.tagName === 'LI') {
                    el.style.color = 'rgba(0,0,0,0.8)';
                  } else if (el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'H4') {
                    el.style.color = '#1a1a1a';
                  }
                }
              });
              
              // Update sidebar controls
              const sidebarControls = sidebar?.querySelectorAll('button, .theme-value, .text-size-value');
              sidebarControls?.forEach(el => {
                if (el.classList.contains('theme-value') || el.classList.contains('text-size-value')) {
                  el.style.color = '#1a1a1a';
                } else if (el.tagName === 'BUTTON') {
                  el.style.background = 'rgba(0,0,0,0.05)';
                  el.style.borderColor = 'rgba(0,0,0,0.1)';
                  el.style.color = 'rgba(0,0,0,0.7)';
                }
              });
              
              // Update sidebar text
              const sidebarText = sidebar?.querySelectorAll('div, a');
              sidebarText?.forEach(el => {
                if (el.style.color && el.style.color.includes('255,255,255')) {
                  if (el.style.opacity === '0.5') {
                    el.style.color = 'rgba(0,0,0,0.5)';
                  } else if (el.style.color.includes('0.6')) {
                    el.style.color = 'rgba(0,0,0,0.6)';
                  } else if (el.style.color.includes('0.4')) {
                    el.style.color = 'rgba(0,0,0,0.4)';
                  } else {
                    el.style.color = '#1a1a1a';
                  }
                }
              });
            }
          };
          
          const updateTheme = (index) => {
            currentThemeIndex = (index + themes.length) % themes.length;
            const themeName = themes[currentThemeIndex];
            valueDisplay.textContent = themeName;
            applyTheme(themeName);
          };

          prevBtn.onmouseenter = () => prevBtn.style.background = 'rgba(255,255,255,0.08)';
          prevBtn.onmouseleave = () => prevBtn.style.background = 'rgba(255,255,255,0.05)';
          prevBtn.onclick = () => updateTheme(currentThemeIndex - 1);

          nextBtn.onmouseenter = () => nextBtn.style.background = 'rgba(255,255,255,0.08)';
          nextBtn.onmouseleave = () => nextBtn.style.background = 'rgba(255,255,255,0.05)';
          nextBtn.onclick = () => updateTheme(currentThemeIndex + 1);
          
          // Apply dark theme by default
          applyTheme('dark');
        }, 0);

        return control;
      }
    },

    index: {
      render(items) {
        const index = document.createElement('div');
        index.innerHTML = '<div style="font-size: 20px; font-weight: 600; margin-bottom: 20px; color: white;">Index</div>';

        const list = document.createElement('ul');
        list.style.cssText = `
          list-style: none;
          padding: 0;
          margin: 0;
        `;

        items.forEach((item, idx) => {
          const li = document.createElement('li');
          li.style.cssText = `
            margin-bottom: 8px;
            font-size: 14px;
            line-height: 1.6;
          `;

          const link = document.createElement('a');
          link.href = `#section-${idx}`;
          link.style.cssText = `
            color: rgba(255,255,255,0.6);
            text-decoration: none;
            display: block;
            padding: 8px 12px;
            border-radius: 6px;
            transition: all 0.2s;
          `;
          link.textContent = `${idx + 1}. ${item.title}`;
          link.onmouseenter = () => {
            link.style.color = 'white';
            link.style.background = 'rgba(255,255,255,0.05)';
          };
          link.onmouseleave = () => {
            link.style.color = 'rgba(255,255,255,0.6)';
            link.style.background = 'transparent';
          };

          li.appendChild(link);

          // Nested items
          if (item.children && item.children.length > 0) {
            const sublist = document.createElement('ul');
            sublist.style.cssText = 'list-style: none; padding-left: 20px; margin-top: 4px;';
            item.children.forEach(child => {
              const subli = document.createElement('li');
              subli.style.cssText = 'margin-bottom: 4px; font-size: 13px;';
              const sublink = document.createElement('a');
              sublink.href = `#${child.id}`;
              sublink.style.cssText = `
                color: rgba(255,255,255,0.4);
                text-decoration: none;
                display: block;
                padding: 6px 12px;
                border-radius: 4px;
                transition: all 0.2s;
              `;
              sublink.textContent = child.title;
              sublink.onmouseenter = () => {
                sublink.style.color = 'rgba(255,255,255,0.8)';
                sublink.style.background = 'rgba(255,255,255,0.03)';
              };
              sublink.onmouseleave = () => {
                sublink.style.color = 'rgba(255,255,255,0.4)';
                sublink.style.background = 'transparent';
              };
              subli.appendChild(sublink);
              sublist.appendChild(subli);
            });
            li.appendChild(sublist);
          }

          list.appendChild(li);
        });

        index.appendChild(list);
        return index;
      }
    }
  },

  // ============ SECTION COMPONENTS ============
  section: {
    render(data, index) {
      const section = document.createElement('section');
      section.id = `section-${index}`;
      section.className = 'report-section';
      section.style.cssText = `
        margin-bottom: 60px;
        scroll-margin-top: 20px;
      `;

      if (data.title) {
        section.appendChild(this.title.render(data.title, index + 1));
      }

      // Render content based on type
      data.content?.forEach(item => {
        const component = ReportComponents[item.type];
        if (component && component.render) {
          section.appendChild(component.render(item.data));
        }
      });

      return section;
    },

    title: {
      render(text, number) {
        const title = document.createElement('h2');
        title.style.cssText = `
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 24px 0;
          color: rgba(255,255,255,0.95);
        `;
        title.textContent = `${number}. ${text}`;
        return title;
      }
    }
  },

  // ============ TEXT COMPONENTS ============
  text: {
    render(data) {
      const p = document.createElement('p');
      p.style.cssText = `
        font-size: 16px;
        line-height: 1.8;
        color: rgba(255,255,255,0.7);
        margin-bottom: 20px;
      `;
      p.textContent = data.content || data;
      return p;
    }
  },



  // ============ LIST COMPONENTS ============
  list: {
    render(data) {
      const ul = document.createElement('ul');
      ul.style.cssText = `
        margin: 20px 0;
        padding-left: 24px;
        color: rgba(255,255,255,0.7);
      `;

      data.items?.forEach(item => {
        const li = document.createElement('li');
        li.style.cssText = `
          margin-bottom: 12px;
          line-height: 1.6;
        `;

        if (typeof item === 'string') {
          li.textContent = item;
        } else {
          li.innerHTML = `<strong style="color: rgba(255,255,255,0.9);">${item.label}:</strong> ${item.value}`;
        }

        ul.appendChild(li);
      });

      return ul;
    }
  },

  // ============ IMAGE/DIAGRAM COMPONENTS ============
  diagram: {
    render(data) {
      const figure = document.createElement('figure');
      figure.style.cssText = `
        margin: 32px 0;
        text-align: center;
      `;

      const img = document.createElement('img');
      img.src = data.src;
      img.alt = data.alt || '';
      img.style.cssText = `
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      figure.appendChild(img);

      if (data.caption) {
        const caption = document.createElement('figcaption');
        caption.style.cssText = `
          margin-top: 12px;
          font-size: 14px;
          color: rgba(255,255,255,0.5);
          font-style: italic;
        `;
        caption.textContent = data.caption;
        figure.appendChild(caption);
      }

      return figure;
    }
  },

  // ============ CHART COMPONENTS ============
  chart: {
    render(data) {
      const container = document.createElement('div');
      container.style.cssText = `
        margin: 32px 0;
        background: rgba(255,255,255,0.03);
        padding: 24px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.05);
      `;

      if (data.title) {
        const title = document.createElement('h4');
        title.style.cssText = `
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 16px 0;
          color: rgba(255,255,255,0.9);
        `;
        title.textContent = data.title;
        container.appendChild(title);
      }

      const canvas = document.createElement('canvas');
      canvas.id = `chart-${Date.now()}-${Math.random()}`;
      canvas.style.cssText = 'max-height: 300px;';
      container.appendChild(canvas);

      // Initialize chart after DOM insertion
      setTimeout(() => {
        if (window.Chart) {
          new Chart(canvas, {
            type: data.type || 'line',
            data: data.data,
            options: {
              responsive: true,
              maintainAspectRatio: true,
              plugins: {
                legend: {
                  display: data.showLegend !== false,
                  labels: {
                    color: 'rgba(255,255,255,0.7)'
                  }
                }
              },
              scales: {
                x: {
                  ticks: { color: 'rgba(255,255,255,0.6)' },
                  grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                  ticks: { color: 'rgba(255,255,255,0.6)' },
                  grid: { color: 'rgba(255,255,255,0.05)' }
                }
              }
            }
          });
        }
      }, 100);

      return container;
    }
  },

  pieChart: {
    render(data) {
      return ReportComponents.chart.render({
        ...data,
        type: 'pie'
      });
    }
  },

  barChart: {
    render(data) {
      return ReportComponents.chart.render({
        ...data,
        type: 'bar'
      });
    }
  },

  lineChart: {
    render(data) {
      return ReportComponents.chart.render({
        ...data,
        type: 'line'
      });
    }
  },

  // ============ FOOTER COMPONENTS ============
  footer: {
    render(data) {
      const footer = document.createElement('footer');
      footer.style.cssText = `
        margin-top: 80px;
        padding-top: 40px;
        border-top: 1px solid rgba(255,255,255,0.1);
      `;

      if (data.sources) {
        footer.appendChild(this.sources.render(data.sources));
      }

      return footer;
    },

    sources: {
      render(sources) {
        const container = document.createElement('div');
        container.innerHTML = '<h3 style="font-size: 24px; margin-bottom: 24px; color: rgba(255,255,255,0.95);">Sources :</h3>';

        const grid = document.createElement('div');
        grid.style.cssText = `
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        `;

        sources.forEach(source => {
          const card = document.createElement('a');
          card.href = source.url;
          card.target = '_blank';
          card.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 8px;
            text-decoration: none;
            color: rgba(255,255,255,0.9);
            transition: all 0.2s;
          `;
          card.onmouseenter = () => {
            card.style.transform = 'translateY(-2px)';
            card.style.background = 'rgba(255,255,255,0.05)';
            card.style.borderColor = 'rgba(255,255,255,0.1)';
          };
          card.onmouseleave = () => {
            card.style.transform = 'translateY(0)';
            card.style.background = 'rgba(255,255,255,0.03)';
            card.style.borderColor = 'rgba(255,255,255,0.05)';
          };

          const icon = document.createElement('div');
          icon.style.cssText = `
            font-size: 24px;
            flex-shrink: 0;
          `;
          icon.textContent = source.icon || '📄';
          card.appendChild(icon);

          const info = document.createElement('div');
          info.style.cssText = 'flex: 1; min-width: 0;';
          info.innerHTML = `
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255,255,255,0.95);">${source.title}</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${source.type || 'source'}</div>
          `;
          card.appendChild(info);

          grid.appendChild(card);
        });

        container.appendChild(grid);
        return container;
      }
    }
  }
};
