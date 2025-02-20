import { ClientOnly } from 'remix-utils/client-only';
import { Header } from '~/components/header/Header';
import { Menu } from '~/components/sidebar/Menu.client';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ToastContainerWrapper, Status, Keywords } from './problems';
import { toast } from 'react-toastify';
import { useCallback, useEffect } from 'react';
import { useState } from 'react';
import { useParams } from '@remix-run/react';
import {
  type Problem,
  type ProblemComment,
  getProblem,
  updateProblem as backendUpdateProblem,
  getProblemsUsername,
  hasNutAdminKey,
  addProblemComment,
} from '~/lib/supabase/problems';

function Comments({ comments }: { comments: ProblemComment[] }) {
  return (
    <div className="comments">
      {comments.map((comment) => (
        <div key={comment.id} className="comment">
          <div className="comment-header">
            <span className="comment-username">{comment.username}</span>
            <span className="comment-date">
              {new Date(comment.created_at).toLocaleString()}
            </span>
          </div>
          <div className="comment-text">{comment.content}</div>
        </div>
      ))}
    </div>
  );
}

function ProblemViewer({ problem }: { problem: Problem }) {
  const { id, title, description, status = 'pending', keywords = [], problem_comments = [] } = problem;

  return (
    <div className="benchmark">
      <h1 className="text-xl4 font-semibold mb-2">{title}</h1>
      <p>{description}</p>
      <a 
        href={`/load-problem/${id}`} 
        className="load-button inline-block px-4 py-2 mt-3 mb-3 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors duration-200 font-medium"
      >
        Load Problem
      </a>
      <Status status={status} />
      <Keywords keywords={keywords} />
      <Comments comments={problem_comments} />
    </div>
  );
}

interface UpdateProblemFormProps {
  handleSubmit: (content: string) => void;
  updateText: string;
  placeholder: string;
}

function UpdateProblemForm(props: UpdateProblemFormProps) {
  const { handleSubmit, updateText, placeholder } = props;
  const [value, setValue] = useState("");

  const onSubmitClicked = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (value.trim()) {
      handleSubmit(value);
      setValue('');
    }
  };

  return (
    <form onSubmit={onSubmitClicked} className="mb-6 p-4 bg-bolt-elements-background-depth-2 rounded-lg">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full p-3 mb-3 bg-bolt-elements-background-depth-3 rounded-md border border-bolt-elements-background-depth-4 text-black placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-h-[100px]"
        required
      />
      <button 
        type="submit" 
        disabled={!value.trim()}
        className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        {updateText}
      </button>
    </form>
  );
}

type DoUpdateCallback = (problem: Problem) => Partial<Problem>;
type UpdateProblemCallback = (doUpdate: DoUpdateCallback) => void;

function UpdateProblemForms({ updateProblem }: { updateProblem: UpdateProblemCallback }) {
  const params = useParams();
  const problemId = params.id;
  if (!problemId) return null;

  const handleAddComment = async (content: string) => {
    await addProblemComment({
      problem_id: problemId,
      content,
      username: getProblemsUsername(),
    });
  };

  const handleSetTitle = (title: string) => {
    updateProblem(() => ({ title }));
  };

  const handleSetDescription = (description: string) => {
    updateProblem(() => ({ description }));
  };

  const handleSetStatus = (status: string) => {
    if (!['pending', 'solved', 'unsolved'].includes(status)) {
      toast.error('Invalid status');
      return;
    }
    updateProblem(() => ({ status: status as Problem['status'] }));
  };

  const handleSetKeywords = (keywordString: string) => {
    const keywords = keywordString.split(' ').map(keyword => keyword.trim()).filter(keyword => keyword.length > 0);
    updateProblem(() => ({ keywords }));
  };

  return (
    <>
      <UpdateProblemForm handleSubmit={handleAddComment} updateText="Add Comment" placeholder="Add a comment..." />
      <UpdateProblemForm handleSubmit={handleSetTitle} updateText="Set Title" placeholder="Set the title of the problem..." />
      <UpdateProblemForm handleSubmit={handleSetDescription} updateText="Set Description" placeholder="Set the description of the problem..." />
      <UpdateProblemForm handleSubmit={handleSetStatus} updateText="Set Status" placeholder="Set the status of the problem..." />
      <UpdateProblemForm handleSubmit={handleSetKeywords} updateText="Set Keywords" placeholder="Set the keywords of the problem..." />
    </>
  );
}

function ViewProblemPage() {
  const params = useParams();
  const problemId = params.id;
  if (typeof problemId !== 'string') {
    throw new Error('Problem ID is required');
  }

  const [problemData, setProblemData] = useState<Problem | null>(null);

  const updateProblem = useCallback(async (callback: DoUpdateCallback) => {
    if (!problemData) {
      toast.error('Problem data missing');
      return;
    }
    const updates = callback(problemData);
    if (Object.keys(updates).length > 0) {
      await backendUpdateProblem(problemId, updates);
    }
    const updatedProblem = await getProblem(problemId);
    if (updatedProblem) {
      setProblemData(updatedProblem);
    }
  }, [problemData, problemId]);

  useEffect(() => {
    getProblem(problemId).then(problem => {
      if (problem) {
        setProblemData(problem);
      }
    });
  }, [problemId]);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
        <BackgroundRays />
        <Header />
        <ClientOnly>{() => <Menu />}</ClientOnly>
        
        <div className="p-6">
          {problemData === null ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : (
            <ProblemViewer problem={problemData} />
          )}
        </div>
        {hasNutAdminKey() && problemData && (
          <UpdateProblemForms updateProblem={updateProblem} />
        )}
        <ToastContainerWrapper />
      </div>
    </TooltipProvider>
  );
}

export default ViewProblemPage;
