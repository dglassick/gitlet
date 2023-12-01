import fs from 'fs';
import path from 'path';

const gitlet = module.exports = {
    // initializes current director as a new repo
    init: (opts) => {
        // if already a repo abort
        if (files.inRepo()) return;
        
        opts = opts || {};

        // create a js object that mirrors git basic directory structure
        const gitletStructure = {
            HEAD: 'ref: refs/heads/master\n',
            // if --bare is passed, write to Git config that repo is bare, else don't
            config: config.objToStr({ cor: { "": { bare: opts.bare === true } } }),

            objects: {},
            refs: {
                heads: {},
            }
        };

        // write git directory structure using gitletStructure if repo is not bare put inside .gitlet director else send to top level
        files.writeFilesFromTree(opts.bare ? gitletStructure : { ".gitlet": gitletStructure}, process.cwd());
    },
    // adds files that match path to index
    add: (path, _) => {
        files.assertInRepo();
        config.assertNotBare();
        
        // gets path of all matching files
        const addedFiles = files.lsRecursive(path);

        // if no fiels abort otherwise add file
        if (addedFiles.length === 0) {
            throw new Error (files.pathFromRepoRoot(path) + 'did not match any files');

        } else {
            addedFiles.forEach((p) => gitlet.update_index(p, { add: true }));

        }
    },
    // removes files that match path from index
    rm: (path, opts) => {
        files.assertInRepo();
        config.assertNotBare();
        opts = opts || {};
        
        // get all paths of files to remove
        const filesToRm = index.matchingFiles(path);

        // abort if -f was passed, removal changes not supported
        if (opts.f) {
            throw new Error("unsupported");

        } 
        // abort if no files match path
        else if (filesToRm.length === 0) {
            throw new Error(files.pathFromRepoRoot(path) + 'did not match any files');

        }
        // abort if path is a directory and -r was not passed
        else if (fs.existsSync(path) && fs.statSync(path).isDirectory() && !opts.r) {
            throw new Error('not removing' + path + 'recursively without -r');

        } else {
            // get list of all files that are to be removed and have been changed on dist
            var changesToRm = util.intersection(diff.addedOrModifiedFiles(), filesToRm);

            // if list is not empty then abort
            if (changesToRm.length > 0) {
                throw new Error('these files have changes:\n' + changesToRm('\n') + '\n')

            } else {
                // else remove files that match path, delete from disc and remove from index
                filesToRm.map(files.workingCopyPath).filter(fs.existsSync).forEach(fs.unlinkSync);
                filesToRm.forEach((p) => gitlet.update_index(p, { remove: true}));
            }
        }
    },
    // creates commit object that represents current state of index, writes commit objects to directory and points to HEAD
    commit: (opts) => {
        files.assertInRepo();
        config.assertNotBare();

        // write a tree set of tree objects that represent current index state
        const treeHash = gitlet.write_tree();

        const headDesc = refs.isHeadDetached() ? 'detached HEAD' : refs.headBranchName();

        // compare hash of tree object to top of tree just written with hash of tree object HEAD points to,
        // if same abort because nothing new to commit
        if (refs.hash("HEAD") !== undefined && treeHash === objects.treeHash(objects.read(refs.hash("HEAD")))) {
            throw new Error("# On " + headDesc + '\nnothing to commit, working directory clean');

        } else {
            const conflictedPaths = index.conflictedPAths();

            // abort if repo is in the merge state and unresolved merge conflicts else commit
            if(merge.isMergeInProgress() && conflictedPaths.length > 0) {
                throw new Error(conflictedPaths.map((p) => "U " + p).join("\n") + "\ncannot commit because you have unmerged fiels\n");

            } else {

                // if repo is in merge state, use pre-written merge commit message, if not in merge state pass message with -m
                const m = merge.isMergeInProgress() ? files.read(files.gitletPath("MERGE_MSG")) : opts.m;

                // write new commit to objects directory
                const commitHash = objects.writeCommit(treeHash, m, refs.commitParentHashes());

                // point HEAD at new commit
                gitlet.update_ref("HEAD", commitHash);

                // if MERGE_HEAD repo is in merge state, remove MERGE_HEAD and MERGE_MSG to exit merge state, return confirm message
                if (merge.isMergeInProgress()) {
                    fs.unlinkSync(files.gitletPath("MERGE_MSG"));
                    refs.rm("MERGE_HEAD");
                    return "Merge made by the three-way stategy"

                } else {
                    
                    // repo was not in merge state, report commit complete
                    return "[" + headDesc + ' ' + commitHash + "] " + m;
                }
            }
        }
    },
    
}