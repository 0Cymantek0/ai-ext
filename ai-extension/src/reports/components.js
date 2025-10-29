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
        ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.7)), url('${data.backgroundImage}')`
        : '#1a1a1a';

      hero.style.cssText = `
        position: relative;
        min-height: 400px;
        background: ${backgroundStyle};
        background-size: cover;
        background-position: center;
        color: white;
        padding: 60px 40px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
      `;

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
          gap: 8px;
          background: rgba(255,255,255,0.2);
          backdrop-filter: blur(10px);
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          margin-bottom: 20px;
          width: fit-content;
        `;
        badge.innerHTML = `<span>📁</span><span>${name}</span>`;
        return badge;
      }
    },

    title: {
      render(text) {
        const title = document.createElement('h1');
        title.style.cssText = `
          font-size: 48px;
          font-weight: 700;
          margin: 0 0 16px 0;
          line-height: 1.2;
          max-width: 800px;
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
          line-height: 1.6;
          margin: 0;
          max-width: 700px;
          opacity: 0.9;
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
        background: #1a1a1a;
        color: white;
        padding: 20px;
        overflow-y: auto;
        transition: transform 0.3s;
        z-index: 1000;
      `;

      // Collapse button
      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'sidebar-collapse';
      collapseBtn.textContent = '☰ collapse sidebar';
      collapseBtn.style.cssText = `
        background: transparent;
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        width: 100%;
        margin-bottom: 20px;
        font-size: 12px;
      `;
      collapseBtn.onclick = () => {
        sidebar.style.transform = sidebar.style.transform === 'translateX(-100%)'
          ? 'translateX(0)'
          : 'translateX(-100%)';
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

      return sidebar;
    },

    textSizeControl: {
      render() {
        const control = document.createElement('div');
        control.style.cssText = 'margin-bottom: 30px;';
        control.innerHTML = `
          <div style="font-size: 12px; margin-bottom: 10px; opacity: 0.7;">text size</div>
          <div style="display: flex; gap: 8px;">
            <button class="text-size-btn" data-size="small" style="background: rgba(255,255,255,0.1); border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">A</button>
            <button class="text-size-btn" data-size="medium" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 14px;">A</button>
            <button class="text-size-btn" data-size="large" style="background: rgba(255,255,255,0.1); border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 16px;">A</button>
          </div>
        `;

        // Add event listeners
        setTimeout(() => {
          control.querySelectorAll('.text-size-btn').forEach(btn => {
            btn.onclick = () => {
              const size = btn.dataset.size;
              const content = document.getElementById('reportMainContent');
              if (content) {
                content.className = `text-size-${size}`;
              }
            };
          });
        }, 0);

        return control;
      }
    },

    index: {
      render(items) {
        const index = document.createElement('div');
        index.innerHTML = '<div style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">Index</div>';

        const list = document.createElement('ul');
        list.style.cssText = `
          list-style: none;
          padding: 0;
          margin: 0;
        `;

        items.forEach((item, idx) => {
          const li = document.createElement('li');
          li.style.cssText = `
            margin-bottom: 12px;
            font-size: 13px;
            line-height: 1.5;
          `;

          const link = document.createElement('a');
          link.href = `#section-${idx}`;
          link.style.cssText = `
            color: rgba(255,255,255,0.7);
            text-decoration: none;
            display: block;
            padding: 4px 0;
            transition: color 0.2s;
          `;
          link.textContent = `${idx + 1}. ${item.title}`;
          link.onmouseenter = () => link.style.color = 'white';
          link.onmouseleave = () => link.style.color = 'rgba(255,255,255,0.7)';

          li.appendChild(link);

          // Nested items
          if (item.children && item.children.length > 0) {
            const sublist = document.createElement('ul');
            sublist.style.cssText = 'list-style: none; padding-left: 16px; margin-top: 8px;';
            item.children.forEach(child => {
              const subli = document.createElement('li');
              subli.style.cssText = 'margin-bottom: 6px; font-size: 12px;';
              subli.innerHTML = `<a href="#${child.id}" style="color: rgba(255,255,255,0.5); text-decoration: none;">${child.title}</a>`;
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
          color: #1a1a1a;
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
        color: #4a5568;
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
        background: #f7fafc;
        border-left: 4px solid #667eea;
        padding: 24px;
        margin-bottom: 32px;
        border-radius: 4px;
      `;

      if (data.title) {
        const title = document.createElement('h3');
        title.style.cssText = `
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 16px 0;
          color: #2d3748;
        `;
        title.textContent = data.title;
        abstract.appendChild(title);
      }

      const content = document.createElement('p');
      content.style.cssText = `
        font-size: 15px;
        line-height: 1.7;
        color: #4a5568;
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
        color: #4a5568;
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
          li.innerHTML = `<strong>${item.label}:</strong> ${item.value}`;
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
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      `;
      figure.appendChild(img);

      if (data.caption) {
        const caption = document.createElement('figcaption');
        caption.style.cssText = `
          margin-top: 12px;
          font-size: 14px;
          color: #718096;
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
        background: white;
        padding: 24px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      `;

      if (data.title) {
        const title = document.createElement('h4');
        title.style.cssText = `
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 16px 0;
          color: #2d3748;
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
                  display: data.showLegend !== false
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
        border-top: 2px solid #e2e8f0;
      `;

      if (data.sources) {
        footer.appendChild(this.sources.render(data.sources));
      }

      return footer;
    },

    sources: {
      render(sources) {
        const container = document.createElement('div');
        container.innerHTML = '<h3 style="font-size: 24px; margin-bottom: 24px; color: #2d3748;">Sources :</h3>';

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
            background: #f7fafc;
            border-radius: 8px;
            text-decoration: none;
            color: #2d3748;
            transition: transform 0.2s, box-shadow 0.2s;
          `;
          card.onmouseenter = () => {
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          };
          card.onmouseleave = () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = 'none';
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
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${source.title}</div>
            <div style="font-size: 12px; color: #718096; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${source.type || 'source'}</div>
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
