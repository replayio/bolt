-- Create problems table
CREATE TABLE IF NOT EXISTS problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'solved', 'unsolved')),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  repository_contents JSONB NOT NULL DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id)
);

-- Create problem_comments table
CREATE TABLE IF NOT EXISTS problem_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  username TEXT NOT NULL
);

-- Create updated_at trigger for problems table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_problems_updated_at
  BEFORE UPDATE ON problems
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create RLS policies
ALTER TABLE problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_comments ENABLE ROW LEVEL SECURITY;

-- Allow public read access to problems and comments
CREATE POLICY "Allow public read access to problems"
  ON problems FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public read access to problem comments"
  ON problem_comments FOR SELECT
  TO public
  USING (true);

-- Allow authenticated users to create and update problems
CREATE POLICY "Allow authenticated users to create problems"
  ON problems FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update problems"
  ON problems FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to create comments
CREATE POLICY "Allow authenticated users to create comments"
  ON problem_comments FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create function to get problem with comments
CREATE OR REPLACE FUNCTION get_problem_with_comments(problem_id UUID)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  title TEXT,
  description TEXT,
  status TEXT,
  keywords TEXT[],
  repository_contents JSONB,
  user_id UUID,
  problem_comments JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.created_at,
    p.updated_at,
    p.title,
    p.description,
    p.status,
    p.keywords,
    p.repository_contents,
    p.user_id,
    COALESCE(
      json_agg(
        json_build_object(
          'id', c.id,
          'created_at', c.created_at,
          'problem_id', c.problem_id,
          'content', c.content,
          'username', c.username
        )
      ) FILTER (WHERE c.id IS NOT NULL),
      '[]'::json
    ) as problem_comments
  FROM problems p
  LEFT JOIN problem_comments c ON c.problem_id = p.id
  WHERE p.id = problem_id
  GROUP BY p.id;
END;
$$ LANGUAGE plpgsql; 