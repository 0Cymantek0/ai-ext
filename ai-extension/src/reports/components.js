/**
 * Report Component Library
 * Granular, reusable components for dynamic report composition
 */

export const ReportComponents = {
  // ============ HERO COMPONENTS ============
  hero: {
    render(data) {
      const hero = document.createElement('div');
      hero.className = 'report-hero';

      // Use black background if no image provided
      const backgroundStyle = data.backgroundImage
        ? `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.8)), url('${data.backgroundImage}')`
        : '#0a0a0a';

      hero.style.cssText = `
        position: relative;
        min-height: 450px;
        background: ${backgroundStyle};
        background-size: cover;
        background-position: center;
        color: white;
        padding: 80px 60px 60px 60px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        margin-left: 280px;
        transition: margin-left 0.3s ease;
      `;
      
      // Add responsive class
      hero.classList.add('report-hero-responsive');

      if (data.pocketName) {
        hero.appendChild(this.pocketBadge.render(data.pocketName));
      }
      if (data.title) {
        hero.appendChild(this.title.render(data.title));
      }
      if (data.subtitle) {
        hero.appendChild(this.subtitle.render(data.subtitle));
      }

      return hero;
    },

    pocketBadge: {
      render(name) {
        const badge = document.createElement('div');
        badge.className = 'pocket-badge';
        badge.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(10px);
          padding: 10px 20px;
          border-radius: 24px;
          font-size: 14px;
          margin-bottom: 24px;
          width: fit-content;
          border: 1px solid rgba(255,255,255,0.1);
        `;
        badge.innerHTML = `<span style="font-size: 16px;">📁</span><span>${name}</span>`;
        return badge;
      }
    },

    title: {
      render(text) {
        const title = document.createElement('h1');
        title.style.cssText = `
          font-size: 56px;
          font-weight: 700;
          margin: 0 0 20px 0;
          line-height: 1.1;
          max-width: 900px;
          letter-spacing: -0.02em;
        `;
        title.textContent = text;
        return title;
      }
    },

    subtitle: {
      render(text) {
        const subtitle = document.createElement('p');
        subtitle.style.cssText = `
          font-size: 15px;
          line-height: 1.6;
          margin: 0;
          max-width: 700px;
          opacity: 0.8;
          color: rgba(255,255,255,0.9);
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
        position: fixed;
        left: 0;
        top: 0;
        width: 280px;
        height: 100vh;
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
        
        // Adjust main content and hero with collapsed class
        const mainContent = document.getElementById('reportMainContent');
        const hero = document.querySelector('.report-hero');
        
        if (isCollapsed) {
          // Expanding sidebar
          if (mainContent) {
            mainContent.classList.remove('sidebar-collapsed');
            mainContent.style.marginLeft = '280px';
          }
          if (hero) {
            hero.classList.remove('sidebar-collapsed');
            hero.style.marginLeft = '280px';
          }
        } else {
          // Collapsing sidebar
          if (mainContent) {
            mainContent.classList.add('sidebar-collapsed');
            mainContent.style.marginLeft = '0';
          }
          if (hero) {
            hero.classList.add('sidebar-collapsed');
            hero.style.marginLeft = '0';
          }
        }
      };
      sidebar.appendChild(collapseBtn);

      // Text size controls
      if (data.showTextSize) {
        sidebar.appendChild(this.textSizeControl.render());
      }

      // Index
      if (data.index) {
        sidebar.appendChild(this.index.render(data.index));
      }

      // Create expand button (initially hidden)
      const expandBtn = document.createElement('button');
      expandBtn.id = 'sidebarExpandBtn';
      expandBtn.innerHTML = '☰';
      expandBtn.style.cssText = `
        position: fixed;
        left: 20px;
        top: 20px;
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
        
        // Adjust main content and hero - remove collapsed class
        const mainContent = document.getElementById('reportMainContent');
        const hero = document.querySelector('.report-hero');
        if (mainContent) {
          mainContent.classList.remove('sidebar-collapsed');
          mainContent.style.marginLeft = '280px';
        }
        if (hero) {
          hero.classList.remove('sidebar-collapsed');
          hero.style.marginLeft = '280px';
        }
      };
      document.body.appendChild(expandBtn);

      return sidebar;
    },

    textSizeControl: {
      render() {
        const control = document.createElement('div');
        control.style.cssText = 'margin-bottom: 32px;';
        control.innerHTML = `
          <div style="font-size: 11px; margin-bottom: 12px; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.5px;">text size</div>
          <div style="display: flex; gap: 8px;">
            <button class="text-size-btn" data-size="small" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.2s;">A</button>
            <button class="text-size-btn active" data-size="medium" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;">A</button>
            <button class="text-size-btn" data-size="large" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 16px; transition: all 0.2s;">A</button>
          </div>
        `;

        // Add event listeners
        setTimeout(() => {
          control.querySelectorAll('.text-size-btn').forEach(btn => {
            btn.onmouseenter = () => {
              if (!btn.classList.contains('active')) {
                btn.style.background = 'rgba(255,255,255,0.08)';
              }
            };
            btn.onmouseleave = () => {
              if (!btn.classList.contains('active')) {
                btn.style.background = 'rgba(255,255,255,0.05)';
              }
            };
            btn.onclick = () => {
              const size = btn.dataset.size;
              const content = document.getElementById('reportMainContent');
              if (content) {
                content.className = `text-size-${size}`;
              }
              
              // Update active state
              control.querySelectorAll('.text-size-btn').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'rgba(255,255,255,0.05)';
                b.style.borderColor = 'rgba(255,255,255,0.1)';
                b.style.color = 'rgba(255,255,255,0.7)';
              });
              btn.classList.add('active');
              btn.style.background = 'rgba(255,255,255,0.1)';
              btn.style.borderColor = 'rgba(255,255,255,0.2)';
              btn.style.color = 'white';
            };
          });
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

  abstract: {
    render(data) {
      const abstract = document.createElement('div');
      abstract.className = 'abstract';
      abstract.style.cssText = `
        background: rgba(255,255,255,0.03);
        border-left: 4px solid #667eea;
        padding: 24px;
        margin-bottom: 32px;
        border-radius: 8px;
      `;

      if (data.title) {
        const title = document.createElement('h3');
        title.style.cssText = `
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 16px 0;
          color: rgba(255,255,255,0.95);
        `;
        title.textContent = data.title;
        abstract.appendChild(title);
      }

      const content = document.createElement('p');
      content.style.cssText = `
        font-size: 15px;
        line-height: 1.7;
        color: rgba(255,255,255,0.7);
        margin: 0;
      `;
      content.textContent = data.content;
      abstract.appendChild(content);

      return abstract;
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
