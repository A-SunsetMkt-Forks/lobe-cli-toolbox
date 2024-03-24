import { alert } from '@lobehub/cli-ui';
import chalk from 'chalk';
import { consola } from 'consola';
import { globSync } from 'glob';
import matter from 'gray-matter';
import pMap from 'p-map';

import { SeoCore, SeoQueryItem } from '@/core/SeoCore';
import { selectors } from '@/store';
import { BlogPost, PostSEO } from '@/types/blog';
import type { SeoConfig } from '@/types/config';
import { readMarkdown, writeMarkdown } from '@/utils/fs';
import { matchInputPattern } from '@/utils/matchInputPattern';

class Seo {
  config: SeoConfig;
  query: SeoQueryItem[] = [];
  seo: SeoCore;
  constructor() {
    this.config = selectors.getSeoConfig();
    this.seo = new SeoCore({
      config: this.config,
      openAIApiKey: selectors.getOpenAIApiKey(),
      openAIProxyUrl: selectors.getOpenAIProxyUrl(),
    });
  }

  async start() {
    consola.start('Lobe Seo is analyzing your mdx... 🤯🌏🔍');
    const entry = this.config.entry;

    if (!entry || entry.length === 0) alert.error('No mdx entry was found.', true);

    let files = globSync(matchInputPattern(entry, this.config.entryExtension), {
      ignore: matchInputPattern(this.config.exclude || [], this.config.entryExtension),
      nodir: true,
    }).filter((file) => file.includes(this.config.entryExtension));

    if (!files || files.length === 0) alert.error('No mdx entry was found.', true);

    this.genFilesQuery(files);

    if (this.query.length > 0) {
      await this.runQuery();
    } else {
      consola.success('No content requiring seo was found.');
    }
    consola.success('All seo tasks have been completed！');
  }

  async runQuery() {
    consola.info(
      `Current model setting: ${chalk.cyan(this.config.modelName)} (temperature: ${chalk.cyan(
        this.config.temperature,
      )}) ${this.config.experimental?.jsonMode ? chalk.red(' [JSON Mode]') : ''}}`,
    );
    let totalTokenUsage = 0;

    await pMap(
      this.query,
      async (item) => {
        const data = await this.seo.run({
          ...item,
          onProgress: ({ isLoading }) => {
            if (isLoading) {
              consola.start(item.entry);
            }
          },
        });

        if (data?.result && Object.keys(data.result).length > 0) {
          const result = matter.stringify(item.rawContent, data.result);
          writeMarkdown(item.entry, result);
          totalTokenUsage += data.tokenUsage;
          consola.success(
            chalk.yellow(item.entry),
            chalk.gray(`[Token usage: ${data.tokenUsage}]`),
          );
        } else {
          consola.warn('No translation result was found:', chalk.yellow(item.entry));
        }
      },
      { concurrency: this.config.concurrency || 5 },
    );

    if (totalTokenUsage > 0) consola.info('Total token usage:', chalk.cyan(totalTokenUsage));
  }

  genFilesQuery(files: string[], skipLog?: boolean) {
    if (!skipLog) consola.start(`Running in ${chalk.bold.cyan(`📄 ${files.length} Mdx`)}..`);

    for (const file of files) {
      try {
        const md = readMarkdown(file);
        const { data, content } = matter(md);
        let gptContent = content;
        if (data) {
          let seo: PostSEO;
          seo = this.config.groupKey
            ? ((data as BlogPost)?.[this.config.groupKey] as PostSEO)
            : (data as BlogPost);

          if (seo && seo.tags && seo.title && seo.description) {
            continue;
          }
        }

        if (this.config.groupKey && (data as BlogPost)?.title) {
          gptContent = [`#${(data as BlogPost)?.title}`, content].join('\n\n');
        }

        this.query.push({
          content: gptContent,
          entry: file,
          matter: (data as BlogPost) || {},
          rawContent: content,
        });
      } catch {
        alert.error(`${file} not found`, true);
      }
    }
  }
}

export default Seo;
