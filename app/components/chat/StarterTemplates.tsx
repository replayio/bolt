import React from 'react';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from '~/utils/constants';

interface FrameworkLinkProps {
  template: Template;
}

const FrameworkLink: React.FC<FrameworkLinkProps> = ({ template }) => (
  <a
    href={`/git?url=https://github.com/${template.githubRepo}.git`}
    data-state="closed"
    data-discover="true"
    className="items-center justify-center"
  >
    <div
      className={`inline-block ${template.icon} w-8 h-8 text-4xl transition-theme opacity-25 hover:opacity-100 hover:text-purple-500 dark:text-white dark:opacity-50 dark:hover:opacity-100 dark:hover:text-purple-400 transition-all`}
      title={template.label}
    />
  </a>
);

const StarterTemplates: React.FC = () => {
  // Debug: Log available templates and their icons
  React.useEffect(() => {
    console.log(
      'Available templates:',
      STARTER_TEMPLATES.map((t) => ({ name: t.name, icon: t.icon })),
    );
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <span className="text-sm text-gray-500">or start a blank app with your favorite stack</span>
      <div className="flex justify-center">
        <div className="flex w-70 flex-wrap items-center justify-center gap-4">
          {STARTER_TEMPLATES.map((template) => (
            <FrameworkLink key={template.name} template={template} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StarterTemplates;
